// Email → document pipeline. Idempotent on message id.
import { createHash } from "node:crypto";
import { getSettings, one, query } from "./db";
import { aiEnabled, extractFromEmail, suggestUpdate, type FileInput } from "./ai";
import { parseSubject } from "./subject";
import { getDocument, logEvent, nextCode, pickAssignee } from "./repo";
import { appUrl, notify } from "./notify";
import { membersForStage, resume } from "./flow";
import { stageDef } from "./workflow";

export interface IncomingEmail {
  source: "graph" | "upload" | "webhook" | "manual";
  messageId: string | null;
  graphId?: string | null;
  threadKey?: string | null;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  to: string[];
  cc: string[];
  receivedAt: string;
  body: string;
  attachments: FileInput[];
}

export interface IngestResult {
  outcome: "created" | "updated" | "duplicate" | "ignored";
  documentId?: number;
  detail?: string;
}

async function log(e: IncomingEmail, r: IngestResult) {
  await query(`insert into ingest_log (source, subject, from_email, outcome, document_id, detail) values ($1,$2,$3,$4,$5,$6)`, [
    e.source, e.subject?.slice(0, 300), e.fromEmail, r.outcome, r.documentId ?? null, r.detail?.slice(0, 500) ?? null,
  ]);
  return r;
}

const internalDomains = () => (process.env.INTERNAL_DOMAINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const isExternal = (email: string | null) => {
  const d = email?.split("@")[1]?.toLowerCase();
  const list = internalDomains();
  return Boolean(d && list.length && !list.includes(d));
};

export async function saveAttachments(documentId: number, emailId: number | null, files: FileInput[]) {
  let n = 0;
  for (const f of files) {
    if (!f.data?.byteLength) continue;
    const sha = createHash("sha256").update(f.data).digest("hex");
    const r = await query(
      `insert into attachments (document_id, email_id, filename, content_type, size, sha256, data)
       values ($1,$2,$3,$4,$5,$6, decode($7,'base64')) on conflict (document_id, sha256) do nothing returning id`,
      [documentId, emailId, f.name.slice(0, 250), f.contentType || "application/octet-stream", f.data.byteLength, sha, Buffer.from(f.data).toString("base64")],
    );
    n += r.length;
  }
  return n;
}

async function findDocument(e: IncomingEmail, code: string | null, normalized: string): Promise<number | null> {
  if (e.threadKey) {
    const r = await one<{ document_id: number }>(`select document_id from emails where thread_key=$1 and document_id is not null order by id limit 1`, [e.threadKey]);
    if (r) return r.document_id;
    const d = await one<{ id: number }>(`select id from documents where thread_key=$1 limit 1`, [e.threadKey]);
    if (d) return d.id;
  }
  if (code) {
    const d = await one<{ id: number }>(`select id from documents where code=$1`, [code]);
    if (d) return d.id;
  }
  if (normalized.length >= 8) {
    const d = await one<{ id: number }>(
      `select id from documents where normalized_subject=$1 and status in ('active','on_hold') order by created_at desc limit 1`,
      [normalized],
    );
    if (d) return d.id;
  }
  return null;
}

/** True when this email belongs to a thread we already track (used to accept replies without the keyword). */
export async function isKnownThread(threadKey: string | null | undefined) {
  if (!threadKey) return false;
  return Boolean(await one(`select 1 from emails where thread_key=$1 limit 1`, [threadKey]));
}

export async function ingestEmail(e: IncomingEmail, opts: { force?: boolean } = {}): Promise<IngestResult> {
  if (e.messageId) {
    const dup = await one<{ document_id: number | null }>(`select document_id from emails where message_id=$1`, [e.messageId]);
    if (dup) return { outcome: "duplicate", documentId: dup.document_id ?? undefined };
  }

  const settings = await getSettings();
  const p = parseSubject(e.subject, settings.subjectKeywords);
  const existingId = await findDocument(e, p.code, p.normalized);

  if (!existingId && !p.matched && !opts.force) {
    return log(e, { outcome: "ignored", detail: "Subjek tidak mengandung kata kunci" });
  }

  const from = [e.fromName, e.fromEmail && `<${e.fromEmail}>`].filter(Boolean).join(" ");

  /* ---------- reply on an existing document ---------- */
  if (existingId) {
    const doc = (await getDocument(existingId))!;
    const em = await one<{ id: number }>(
      `insert into emails (document_id, message_id, graph_id, thread_key, subject, from_name, from_email, to_list, cc_list, received_at, body_text, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (message_id) do nothing returning id`,
      [existingId, e.messageId, e.graphId ?? null, e.threadKey ?? null, e.subject, e.fromName, e.fromEmail, e.to.join(", "), e.cc.join(", "), e.receivedAt, e.body.slice(0, 100_000), e.source],
    );
    if (!em) return { outcome: "duplicate", documentId: existingId };
    const saved = await saveAttachments(existingId, em.id, e.attachments);
    await query(`update documents set last_activity_at=now(), updated_at=now() where id=$1`, [existingId]);
    await logEvent(existingId, { type: "email", actor: e.fromName || e.fromEmail, message: e.subject, meta: { emailId: em.id, attachments: saved } });

    // Counterparty answered while we were waiting on them → resume the SLA clock.
    if (doc.status === "on_hold" && isExternal(e.fromEmail)) await resume(existingId, "Sistem", "Pihak lain membalas email — SLA dilanjutkan");

    if (aiEnabled() && doc.status !== "done" && doc.status !== "cancelled") {
      try {
        const s = await suggestUpdate(doc, { subject: e.subject, from, body: e.body });
        if (s.suggested_stage && s.suggested_stage !== doc.stage && stageDef(doc.doc_type, s.suggested_stage)) {
          await query(`update documents set ai_suggestion=$2::jsonb where id=$1`, [existingId, JSON.stringify({ stage: s.suggested_stage, hold: s.hold, reason: s.reason, emailId: em.id, at: new Date().toISOString() })]);
        } else if (s.hold && doc.status === "active") {
          await query(`update documents set ai_suggestion=$2::jsonb where id=$1`, [existingId, JSON.stringify({ stage: null, hold: true, reason: s.reason, emailId: em.id, at: new Date().toISOString() })]);
        }
      } catch (err) {
        console.error("suggestUpdate failed", err);
      }
    }

    const who = await membersForStage(doc);
    await notify(who, {
      kind: "reply",
      documentId: existingId,
      subject: `[${doc.code}] Email baru: ${doc.title}`,
      lines: [`Email baru dari ${from || "pengirim tidak dikenal"}`, e.subject, saved ? `${saved} lampiran baru tersimpan` : ""].filter(Boolean),
      link: `${appUrl()}/documents/${existingId}`,
    });
    return log(e, { outcome: "updated", documentId: existingId });
  }

  /* ---------- new document ---------- */
  let ai: Awaited<ReturnType<typeof extractFromEmail>> | null = null;
  let aiError: string | null = null;
  if (aiEnabled()) {
    try {
      ai = await extractFromEmail({ subject: e.subject, from, body: e.body, receivedAt: e.receivedAt }, e.attachments);
    } catch (err) {
      aiError = err instanceof Error ? err.message : String(err);
      console.error("extract failed", err);
    }
  }

  const code = await nextCode();
  const assignee = await pickAssignee();
  const docType = p.docType ?? ai?.doc_type ?? "vendor";
  const value = ai?.contract_value ?? null;
  const row = await one<{ id: number }>(
    `insert into documents (code, title, doc_type, counterparty, contract_value, currency, deadline, urgent, risk_level, assignee_id,
       requester_name, requester_email, summary, key_points, source, thread_key, normalized_subject)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17) returning id`,
    [
      code,
      ai?.title || p.title,
      docType,
      p.counterparty ?? ai?.counterparty ?? null,
      value,
      ai?.currency || "IDR",
      p.deadline ?? ai?.deadline ?? null,
      p.urgent || Boolean(ai?.urgent),
      ai?.risk_level ?? "medium",
      assignee,
      ai?.requester_name || e.fromName,
      e.fromEmail,
      ai?.summary ?? (e.body.slice(0, 400) || null),
      JSON.stringify(ai?.key_points ?? []),
      e.source === "graph" || e.source === "webhook" ? "email" : e.source,
      e.threadKey ?? null,
      p.normalized,
    ],
  );
  const docId = row!.id;
  const em = await one<{ id: number }>(
    `insert into emails (document_id, message_id, graph_id, thread_key, subject, from_name, from_email, to_list, cc_list, received_at, body_text, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [docId, e.messageId, e.graphId ?? null, e.threadKey ?? null, e.subject, e.fromName, e.fromEmail, e.to.join(", "), e.cc.join(", "), e.receivedAt, e.body.slice(0, 100_000), e.source],
  );
  const saved = await saveAttachments(docId, em!.id, e.attachments);
  await logEvent(docId, {
    type: "created",
    actor: "Sistem",
    message: `Dibuat dari email${saved ? ` dengan ${saved} lampiran` : ""}${ai ? " · data diekstrak AI" : aiError ? " · ekstraksi AI gagal, pakai aturan subjek" : ""}`,
    meta: { emailId: em!.id, aiError },
  });

  const doc = (await getDocument(docId))!;
  const who = await membersForStage(doc);
  await notify(who, {
    kind: "created",
    documentId: docId,
    subject: `[${code}] Dokumen baru: ${doc.title}`,
    lines: [`Dokumen legal baru masuk dan ditugaskan ke ${doc.assignee_name ?? "tim"}`, `${doc.title}${doc.counterparty ? ` — ${doc.counterparty}` : ""}`, doc.deadline ? `Deadline: ${doc.deadline}` : "Belum ada deadline", doc.summary ?? ""].filter(Boolean),
    link: `${appUrl()}/documents/${docId}`,
  });
  return log(e, { outcome: "created", documentId: docId, detail: aiError ?? undefined });
}
