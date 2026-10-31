// Workflow transitions shared by the UI, email ingestion and cron.
import { getSettings, query } from "./db";
import { stageCtx, type DocRow } from "./insight";
import { appUrl, notify } from "./notify";
import { getDocument, listMembers, logEvent, type Member } from "./repo";
import { nextStage, stageDef, STATUS_LABEL, type Role } from "./workflow";

export async function membersForStage(doc: DocRow, stageKey = doc.stage): Promise<Member[]> {
  const st = stageDef(doc.doc_type, stageKey);
  const all = await listMembers(true);
  if (st?.approval) return all.filter((m) => m.role === st.role);
  const pic = all.find((m) => m.id === doc.assignee_id);
  return pic ? [pic] : all.filter((m) => m.role === "manager");
}

export async function membersWithRole(role: Role) {
  return (await listMembers(true)).filter((m) => m.role === role);
}

export function canAct(member: Member, doc: DocRow): boolean {
  if (member.role === "admin") return true;
  const st = stageDef(doc.doc_type, doc.stage);
  if (!st) return true;
  if (st.approval) return member.role === st.role;
  return member.role !== "cpo"; // CPLO only approves
}

async function notifyStage(doc: DocRow, headline: string) {
  const st = stageDef(doc.doc_type, doc.stage);
  const who = await membersForStage(doc);
  await notify(who, {
    kind: "stage",
    documentId: doc.id,
    subject: `[${doc.code}] ${st?.approval ? "Butuh approval" : "Tahap baru"}: ${doc.title}`,
    lines: [headline, `${doc.title}${doc.counterparty ? ` — ${doc.counterparty}` : ""}`, `Tahap: ${st?.label ?? doc.stage} (SLA ${st?.slaDays ?? "-"} hari kerja)`, doc.deadline ? `Deadline: ${doc.deadline}` : ""].filter(Boolean),
    link: `${appUrl()}/documents/${doc.id}`,
    dedupeKey: `stage:${doc.id}:${doc.stage}:${Date.now() - (Date.now() % 60_000)}`,
  });
}

export async function moveToStage(docId: number, toStage: string, actor: string, opts: { type?: string; message?: string | null } = {}) {
  const before = await getDocument(docId);
  if (!before) throw new Error("Dokumen tidak ditemukan");
  await query(
    `update documents set stage=$2, status='active', hold_reason=null, hold_started_at=null, paused_ms=0,
       stage_entered_at=now(), last_activity_at=now(), updated_at=now(), ai_suggestion=null where id=$1`,
    [docId, toStage],
  );
  await logEvent(docId, { type: opts.type ?? "stage", actor, from: before.stage, to: toStage, message: opts.message ?? null });
  const after = (await getDocument(docId))!;
  const st = stageDef(after.doc_type, toStage);
  await notifyStage(after, opts.type === "revision" ? `Dikembalikan untuk revisi oleh ${actor}` : `${actor} memindahkan dokumen ke ${st?.label ?? toStage}`);
  return after;
}

export async function completeStage(docId: number, actor: string, message?: string | null) {
  const doc = await getDocument(docId);
  if (!doc) throw new Error("Dokumen tidak ditemukan");
  const settings = await getSettings();
  const st = stageDef(doc.doc_type, doc.stage);
  const next = nextStage(doc.doc_type, doc.stage, stageCtx(doc, settings));
  if (!next) {
    await query(`update documents set status='done', completed_at=now(), last_activity_at=now(), updated_at=now(), ai_suggestion=null where id=$1`, [docId]);
    await logEvent(docId, { type: "done", actor, from: doc.stage, message: message ?? "Dokumen selesai & diarsipkan" });
    if (doc.requester_email) {
      /* requester is usually external to the team; we only log it */
    }
    return;
  }
  return moveToStage(docId, next.key, actor, { type: st?.approval ? "approved" : "stage", message });
}

export async function setHold(docId: number, actor: string, reason: string) {
  await query(
    `update documents set status='on_hold', hold_reason=$2, hold_started_at=now(), last_activity_at=now(), updated_at=now() where id=$1 and status='active'`,
    [docId, reason],
  );
  await logEvent(docId, { type: "hold", actor, message: reason });
}

export async function resume(docId: number, actor: string, message?: string) {
  // Add the paused working time to paused_ms so the SLA clock skips it.
  const doc = await getDocument(docId);
  if (!doc || doc.status !== "on_hold") return;
  const { workdaysBetween } = await import("./time");
  const settings = await getSettings();
  const pausedDays = doc.hold_started_at ? workdaysBetween(+new Date(doc.hold_started_at), Date.now(), new Set(settings.holidays)) : 0;
  await query(
    `update documents set status='active', hold_reason=null, hold_started_at=null, paused_ms = paused_ms + $2,
       last_activity_at=now(), updated_at=now() where id=$1`,
    [docId, Math.round(pausedDays * 86_400_000)],
  );
  await logEvent(docId, { type: "resume", actor, message: message ?? `Dilanjutkan (${STATUS_LABEL.active})` });
}
