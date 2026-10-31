// Mailbox sync and the daily SLA / escalation / digest job.
import { getSettings, setKV } from "./db";
import { getAttachments, getMessage, graphConfigured, listRecentMessages, type GraphMessage } from "./graph";
import { ingestEmail, isKnownThread, type IngestResult } from "./ingest";
import { fromGraph } from "./mailparse";
import { insight, LEVEL_LABEL } from "./insight";
import { listDocuments, listMembers } from "./repo";
import { appUrl, notify } from "./notify";
import { ESCALATION, stageDef, ROLE_LABEL } from "./workflow";
import { membersForStage, membersWithRole } from "./flow";
import { wibDate } from "./time";
import { parseSubject } from "./subject";

export async function ingestGraphMessage(m: GraphMessage): Promise<IngestResult | null> {
  const settings = await getSettings();
  const p = parseSubject(m.subject || "", settings.subjectKeywords, settings.workflows);
  const thread = m.conversationId ? `conv:${m.conversationId}` : null;
  if (!p.matched && !p.code && !(await isKnownThread(thread))) return null;
  const files = m.hasAttachments ? await getAttachments(m.id) : [];
  return ingestEmail(fromGraph(m, files));
}

export async function ingestGraphById(id: string) {
  return ingestGraphMessage(await getMessage(id));
}

export async function syncMailbox(days = 2) {
  if (!graphConfigured()) return { skipped: "Microsoft Graph belum dikonfigurasi" };
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const msgs = (await listRecentMessages(since)).reverse(); // oldest first so threads build in order
  const tally = { scanned: msgs.length, created: 0, updated: 0, duplicate: 0, ignored: 0, errors: 0 };
  for (const m of msgs) {
    try {
      const r = await ingestGraphMessage(m);
      if (!r) tally.ignored++;
      else tally[r.outcome]++;
    } catch (e) {
      tally.errors++;
      console.error("sync message failed", m.id, e);
    }
  }
  await setKV("last_sync", { at: new Date().toISOString(), ...tally });
  return tally;
}

export async function runDaily() {
  const settings = await getSettings();
  const docs = await listDocuments();
  const today = wibDate(Date.now());
  const members = await listMembers(true);
  let breaches = 0;
  let escalations = 0;

  for (const d of docs) {
    if (d.status !== "active") continue;
    const ins = insight(d, settings);
    if (ins.slaState !== "breach") continue;
    breaches++;
    const st = stageDef(settings.workflows, d.doc_type, d.stage);
    const link = `${appUrl()}/documents/${d.id}`;
    const over = Math.max(0, ins.slaUsed - ins.slaDays);

    await notify(await membersForStage(d), {
      kind: "sla",
      documentId: d.id,
      subject: `[${d.code}] SLA terlewati: ${d.title}`,
      lines: [`SLA tahap ${st?.label ?? d.stage} sudah lewat`, d.title, `Terpakai ${ins.slaUsed.toFixed(1)} dari ${ins.slaDays} hari kerja · Prioritas ${ins.level} ${LEVEL_LABEL[ins.level]}`],
      link,
      dedupeKey: `sla:${d.id}:${d.stage}:${today}`,
    });

    if (over >= settings.escalateAfterDays && st) {
      const target = ESCALATION[st.role];
      if (target) {
        const sent = await notify(await membersWithRole(target), {
          kind: "escalation",
          documentId: d.id,
          subject: `[${d.code}] Eskalasi: ${d.title} tertahan`,
          lines: [`Eskalasi ke ${ROLE_LABEL[target]}`, `${d.title} tertahan di ${st.label} (${ROLE_LABEL[st.role]}${d.assignee_name ? `, PIC ${d.assignee_name}` : ""})`, `Lewat ${over.toFixed(1)} hari kerja dari SLA`],
          link,
          dedupeKey: `esc:${d.id}:${d.stage}:${today}`,
        });
        if (sent) escalations++;
      }
    }
  }

  let digests = 0;
  const dow = new Date(Date.now() + 7 * 3600_000).getUTCDay();
  if (settings.digestEnabled && dow !== 0 && dow !== 6) {
    const scored = docs.map((d) => ({ d, i: insight(d, settings) })).sort((a, b) => b.i.score - a.i.score);
    for (const m of members) {
      const mine = scored.filter(({ d }) => {
        const st = stageDef(settings.workflows, d.doc_type, d.stage);
        if (m.role === "staff") return d.assignee_id === m.id;
        if (st?.approval) return st.role === m.role;
        return m.role === "manager" || m.role === "admin";
      });
      if (!mine.length) continue;
      const lines = mine.slice(0, 8).map(({ d, i }) =>
        `${i.level} · ${d.title} — ${i.stage?.label ?? d.stage}${i.slaState === "breach" ? " (SLA lewat)" : ""}${i.daysToDeadline !== null ? `, deadline ${i.daysToDeadline < 0 ? `lewat ${-i.daysToDeadline} hr` : `${i.daysToDeadline} hr lagi`}` : ""}`,
      );
      const sent = await notify([m], {
        kind: "digest",
        subject: `Legal Desk: ${mine.length} dokumen menunggu Anda`,
        lines: [`Selamat pagi ${m.name}, ini antrean Anda hari ini`, ...lines],
        link: appUrl(),
        dedupeKey: `digest:${m.id}:${today}`,
      });
      if (sent) digests++;
    }
  }

  const result = { breaches, escalations, digests };
  await setKV("last_daily", { at: new Date().toISOString(), ...result });
  return result;
}
