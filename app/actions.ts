"use server";

import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSettings, one, query, saveSettings } from "@/lib/db";
import { SESSION_COOKIE, safeEqual, signSession } from "@/lib/auth";
import { canAct, completeStage, membersForStage, moveToStage, resume, setHold } from "@/lib/flow";
import { getDocument, logEvent, nextCode, pickAssignee, requireMember } from "@/lib/repo";
import { stageDef, isDocType, isRole, WORKFLOWS } from "@/lib/workflow";
import { appUrl, notify } from "@/lib/notify";
import { normalizeSubject } from "@/lib/subject";
import { runDaily, syncMailbox } from "@/lib/jobs";
import { ensureSubscription, graphConfigured } from "@/lib/graph";
import { saveAttachments } from "@/lib/ingest";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return v ? Number(v) : null;
};

export type Result = { ok: true; message?: string } | { error: string } | null;

/** Run a mutation and turn thrown errors into a message the UI can show. */
async function run(fn: () => Promise<void | string>): Promise<Result> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Gagal menyimpan. Coba lagi." };
  }
}

/* ---------- auth ---------- */

export async function login(_: unknown, f: FormData) {
  const code = str(f, "code");
  const memberId = Number(str(f, "member"));
  const expected = process.env.ACCESS_CODE ?? "";
  if (!expected || !safeEqual(code, expected)) return { error: "Kode akses salah." };
  const m = await one<{ id: number }>(`select id from team_members where id=$1 and active`, [memberId]);
  if (!m) return { error: "Pilih nama Anda dari daftar." };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(m.id), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  const next = str(f, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ---------- workflow ---------- */

async function loadForAction(f: FormData) {
  const me = await requireMember();
  const doc = await getDocument(Number(str(f, "id")));
  if (!doc) throw new Error("Dokumen tidak ditemukan");
  return { me, doc };
}

function done(id: number) {
  revalidatePath("/", "layout");
  revalidatePath(`/documents/${id}`);
}

export async function advanceAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    if (doc.status !== "active") throw new Error("Lanjutkan dokumen dulu sebelum memindahkan tahap.");
    if (!canAct(me, doc)) throw new Error("Tahap ini hanya bisa disetujui oleh peran yang berwenang.");
    await completeStage(doc.id, me.name, str(f, "note") || null);
    done(doc.id);
  });
}

export async function revisionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const st = stageDef(doc.doc_type, doc.stage);
    if (!canAct(me, doc)) throw new Error("Anda tidak berwenang di tahap ini.");
    const to = st?.revisionTo ?? "review";
    await moveToStage(doc.id, to, me.name, { type: "revision", message: str(f, "note") || "Minta revisi" });
    done(doc.id);
  });
}

export async function moveAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    if (me.role === "staff" || me.role === "cpo") throw new Error("Memindahkan tahap secara manual hanya untuk Manager, AGM, atau Admin.");
    const to = str(f, "stage");
    if (!stageDef(doc.doc_type, to)) throw new Error("Tahap tidak valid");
    await moveToStage(doc.id, to, me.name, { type: "moved", message: str(f, "note") || "Dipindah manual" });
    done(doc.id);
  });
}

export async function holdAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    await setHold(doc.id, me.name, str(f, "reason") || "Menunggu pihak lain");
    done(doc.id);
  });
}

export async function resumeAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    await resume(doc.id, me.name);
    done(doc.id);
  });
}

export async function cancelAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    if (me.role === "staff") throw new Error("Pembatalan butuh Manager ke atas.");
    await query(`update documents set status='cancelled', completed_at=now(), updated_at=now() where id=$1`, [doc.id]);
    await logEvent(doc.id, { type: "cancelled", actor: me.name, message: str(f, "reason") || "Dibatalkan" });
    done(doc.id);
  });
}

export async function reopenAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    await query(`update documents set status='active', completed_at=null, stage_entered_at=now(), paused_ms=0, updated_at=now() where id=$1`, [doc.id]);
    await logEvent(doc.id, { type: "reopened", actor: me.name, message: "Dibuka kembali" });
    done(doc.id);
  });
}

export async function applySuggestionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const s = doc.ai_suggestion;
    if (!s) return;
    if (s.stage && stageDef(doc.doc_type, s.stage)) {
      const target = stageDef(doc.doc_type, s.stage)!;
      const current = stageDef(doc.doc_type, doc.stage);
      if ((target.approval || current?.approval) && !canAct(me, doc) && me.role !== "manager" && me.role !== "agm") {
        throw new Error("Saran ini melewati tahap approval; minta approver menerapkannya.");
      }
      await moveToStage(doc.id, s.stage, me.name, { type: "moved", message: `Menerapkan saran AI: ${s.reason}` });
    }
    if (s.hold) await setHold(doc.id, me.name, s.reason);
    await query(`update documents set ai_suggestion=null where id=$1`, [doc.id]);
    done(doc.id);
  });
}

export async function dismissSuggestionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { doc } = await loadForAction(f);
    await query(`update documents set ai_suggestion=null where id=$1`, [doc.id]);
    done(doc.id);
  });
}

export async function noteAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const note = str(f, "note");
    if (!note) return;
    await logEvent(doc.id, { type: "note", actor: me.name, message: note });
    await query(`update documents set last_activity_at=now() where id=$1`, [doc.id]);
    done(doc.id);
  });
}

export async function updateDetailsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const type = str(f, "doc_type");
    const docType = isDocType(type) ? type : doc.doc_type;
    const assignee = str(f, "assignee_id") ? Number(str(f, "assignee_id")) : null;
    const requireCpo = str(f, "require_cpo");
    const fields = {
      title: str(f, "title") || doc.title,
      doc_type: docType,
      counterparty: str(f, "counterparty") || null,
      contract_value: num(f, "contract_value"),
      currency: str(f, "currency") || "IDR",
      deadline: str(f, "deadline") || null,
      urgent: f.get("urgent") === "on",
      risk_level: ["low", "medium", "high"].includes(str(f, "risk_level")) ? str(f, "risk_level") : doc.risk_level,
      require_cpo: requireCpo === "yes" ? true : requireCpo === "no" ? false : null,
      assignee_id: assignee,
    };
    // If the type changed and the current stage doesn't exist in the new workflow, restart at intake.
    const stage = WORKFLOWS[docType].some((s) => s.key === doc.stage) ? doc.stage : "intake";
    await query(
      `update documents set title=$2, doc_type=$3, counterparty=$4, contract_value=$5, currency=$6, deadline=$7, urgent=$8,
        risk_level=$9, require_cpo=$10, assignee_id=$11, stage=$12, updated_at=now() where id=$1`,
      [doc.id, fields.title, fields.doc_type, fields.counterparty, fields.contract_value, fields.currency, fields.deadline, fields.urgent, fields.risk_level, fields.require_cpo, fields.assignee_id, stage],
    );
    const changes: string[] = [];
    if (fields.deadline !== doc.deadline) changes.push(`deadline → ${fields.deadline ?? "kosong"}`);
    if (fields.assignee_id !== doc.assignee_id) changes.push("PIC diganti");
    if (fields.doc_type !== doc.doc_type) changes.push("jenis dokumen diganti");
    if (fields.risk_level !== doc.risk_level) changes.push(`risiko → ${fields.risk_level}`);
    await logEvent(doc.id, { type: "edited", actor: me.name, message: changes.length ? changes.join(", ") : "Detail diperbarui" });
    if (fields.assignee_id && fields.assignee_id !== doc.assignee_id) {
      const after = (await getDocument(doc.id))!;
      await notify(await membersForStage(after), {
        kind: "assigned", documentId: doc.id, subject: `[${doc.code}] Ditugaskan ke Anda: ${doc.title}`,
        lines: [`${me.name} menugaskan dokumen ini ke Anda`, doc.title], link: `${appUrl()}/documents/${doc.id}`,
      });
    }
    done(doc.id);
  });
}

export async function uploadAttachmentAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const { me, doc } = await loadForAction(f);
    const files = f.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);
    const saved = await saveAttachments(doc.id, null, await Promise.all(files.map(async (x) => ({ name: x.name, contentType: x.type, data: new Uint8Array(await x.arrayBuffer()) }))));
    if (saved) await logEvent(doc.id, { type: "attachment", actor: me.name, message: `${saved} lampiran ditambahkan` });
    done(doc.id);
  });
}

export async function createManualAction(f: FormData) {
  const me = await requireMember();
  const type = str(f, "doc_type");
  const title = str(f, "title");
  if (!title) throw new Error("Judul wajib diisi");
  const code = await nextCode();
  const assignee = str(f, "assignee_id") ? Number(str(f, "assignee_id")) : await pickAssignee();
  const r = await one<{ id: number }>(
    `insert into documents (code, title, doc_type, counterparty, contract_value, deadline, urgent, risk_level, assignee_id, requester_name, summary, source, normalized_subject)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12) returning id`,
    [code, title, isDocType(type) ? type : "vendor", str(f, "counterparty") || null, num(f, "contract_value"), str(f, "deadline") || null, f.get("urgent") === "on", str(f, "risk_level") || "medium", assignee, str(f, "requester_name") || me.name, str(f, "summary") || null, normalizeSubject(title)],
  );
  await logEvent(r!.id, { type: "created", actor: me.name, message: "Dibuat manual" });
  const doc = (await getDocument(r!.id))!;
  await notify(await membersForStage(doc), {
    kind: "created", documentId: doc.id, subject: `[${code}] Dokumen baru: ${title}`,
    lines: [`${me.name} membuat dokumen baru untuk Anda`, title], link: `${appUrl()}/documents/${doc.id}`,
  });
  revalidatePath("/", "layout");
  redirect(`/documents/${r!.id}`);
}

/* ---------- settings ---------- */

async function requireLead() {
  const me = await requireMember();
  if (!["manager", "agm", "admin"].includes(me.role)) throw new Error("Pengaturan hanya bisa diubah Manager, AGM, atau Admin.");
  return me;
}

export async function saveMemberAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    const id = str(f, "id");
    const role = str(f, "role");
    if (!isRole(role)) throw new Error("Peran tidak valid");
    const vals = [str(f, "name"), role, str(f, "email") || null, str(f, "whatsapp") || null, f.get("active") === "on"];
    if (!vals[0]) throw new Error("Nama wajib diisi");
    if (id) await query(`update team_members set name=$2, role=$3, email=$4, whatsapp=$5, active=$6 where id=$1`, [Number(id), ...vals]);
    else await query(`insert into team_members (name, role, email, whatsapp, active) values ($1,$2,$3,$4,$5)`, vals);
    revalidatePath("/settings");
  });
}

export async function saveSettingsAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    const current = await getSettings();
    await saveSettings({
      subjectKeywords: str(f, "subjectKeywords").split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      cpoThreshold: num(f, "cpoThreshold") ?? current.cpoThreshold,
      holidays: str(f, "holidays").split(/[\s,]+/).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
      escalateAfterDays: Number(str(f, "escalateAfterDays")) || current.escalateAfterDays,
      digestEnabled: f.get("digestEnabled") === "on",
    });
    revalidatePath("/", "layout");
  });
}

export async function syncNowAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    if (graphConfigured()) {
      await ensureSubscription(appUrl()).catch((e) => console.error("subscription", e));
      await syncMailbox(14);
    }
    revalidatePath("/", "layout");
  });
}

export async function runDailyAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    await runDaily();
    revalidatePath("/settings");
  });
}

export async function deleteDemoAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    await query(`delete from documents where is_demo`);
    revalidatePath("/", "layout");
  });
}
