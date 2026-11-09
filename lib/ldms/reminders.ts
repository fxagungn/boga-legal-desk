// Reminder Engine (blueprint §5.7, §6.3, §14.4). Legal-only. Sending stays off until an email channel is set up and
// the Super Admin switches it on; until then the scan is a simulation that shows exactly what would go out.
import { createHmac } from "node:crypto";
import { query, setKV } from "../db";
import { getFlows } from "../flows";
import { appUrl, emailChannel } from "../notify";
import { listMembers, type Member } from "../repo";
import { formatDate } from "../time";
import { listAgreements } from "./agreements";
import { audit, listPermits, RENEWAL_LABEL, stagesFor, type PermitRow } from "./permits";

export type Stage = string; // "H-60" … "H-1" | "H-0" | "OVERDUE" | "SOMASI" | "NOTICE" | "AGR-H-30" …

export function stageOf(days: number, lead: number): Stage | null {
  if (days < 0) return "OVERDUE";
  if (days === 0) return "H-0";
  const hit = stagesFor(lead).filter((x) => days <= x).pop();
  return hit === undefined ? null : `H-${hit}`;
}

export interface Job {
  entity: "permit" | "agreement";
  entityId: number;
  code: string;
  stage: Stage;
  key: string;
  to: Member | null;
  cc: Member[];
  subject: string;
  days: number;
  title: string;
  unit: string;
  sent: boolean;
  permit?: PermitRow;
}

const wibYmd = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");

async function ladderPeople() {
  const f = (await getFlows()).reminder;
  const members = await listMembers(true);
  const byId = (id: number | null) => (id ? members.find((m) => m.id === id) ?? null : null);
  const supervisor = byId(f.supervisorId) ?? members.find((m) => m.role === "supervisor" && /permit/i.test(m.title ?? "")) ?? members.find((m) => m.role === "supervisor") ?? null;
  const corp = byId(f.corpSupervisorId) ?? members.find((m) => m.role === "supervisor" && m.id !== supervisor?.id) ?? null;
  const head = byId(f.headId) ?? members.find((m) => m.role === "agm") ?? null;
  const director = byId(f.directorId) ?? members.find((m) => m.role === "cpo") ?? null;
  return { members, supervisor, corp, head, director };
}

export async function ladderSummary() {
  const p = await ladderPeople();
  return { supervisor: p.supervisor, corp: p.corp, head: p.head, director: p.director };
}

function uniq(ms: (Member | null)[], not?: Member | null) {
  const seen = new Set<number>();
  return ms.filter((m): m is Member => !!m && m.id !== not?.id && !seen.has(m.id) && !!seen.add(m.id));
}

export async function computeQueue(): Promise<Job[]> {
  const { members, supervisor, corp, head, director } = await ladderPeople();
  const flows = await getFlows();
  const ymd = wibYmd();
  const sent = new Set((await query<{ stage_key: string }>(`select stage_key from reminders where sent_at > now() - interval '400 days'`)).map((r) => r.stage_key));
  const jobs: Job[] = [];

  for (const p of await listPermits()) {
    if (p.days === null) continue;
    const pic = members.find((m) => m.id === p.pic_id) ?? null;
    const st = stageOf(p.days, p.lead_days);
    if (st) {
      const ladder = stagesFor(p.lead_days);
      const rank = st === "OVERDUE" || st === "H-0" ? ladder.length : ladder.indexOf(Number(st.slice(2)));
      const cc = uniq([rank >= 1 ? supervisor : null, rank >= 2 ? head : null, st === "OVERDUE" || st === "H-0" ? director : null], pic);
      const key = `permit:${p.id}|${st}${st === "OVERDUE" || st === "H-0" ? `|${ymd}` : `|${p.expiry_date}`}`;
      const tag = st === "OVERDUE" ? "[OVERDUE]" : st === "H-0" ? "[HARI INI]" : `[${st}]`;
      jobs.push({ entity: "permit", entityId: p.id, code: p.code, stage: st, key, to: pic, cc, days: p.days, title: p.type_name, unit: p.unit_name, sent: sent.has(key), permit: p,
        subject: `${tag} ${p.type_name} — ${p.unit_name} ${st === "OVERDUE" ? `kedaluwarsa ${-p.days} hari` : `jatuh tempo ${p.expiry_date ? formatDate(p.expiry_date) : ""}`}` });
    }
    if (p.requires_ack && !p.ack_at) {
      const key = `permit:${p.id}|SOMASI|${ymd}`;
      jobs.push({ entity: "permit", entityId: p.id, code: p.code, stage: "SOMASI", key, to: pic, cc: uniq([supervisor], pic), days: p.days, title: p.type_name, unit: p.unit_name, sent: sent.has(key), permit: p,
        subject: `[SOMASI] ${p.type_name} — ${p.unit_name}: wajib acknowledge` });
    }
  }

  for (const a of await listAgreements()) {
    if (a.status !== "aktif" || a.days === null) continue;
    const pic = members.find((m) => m.id === a.pic_id) ?? null;
    const points = [...(a.notice_days ? [a.notice_days] : []), ...flows.reminder.agreementStages].sort((x, y) => y - x);
    let st: string | null = null;
    if (a.days < 0) st = "OVERDUE";
    else {
      const hit = points.filter((x) => a.days! <= x).pop();
      if (hit !== undefined) st = a.notice_days && hit === a.notice_days ? `NOTICE-${hit}` : `H-${hit}`;
    }
    if (!st) continue;
    const key = `agreement:${a.id}|${st}${st === "OVERDUE" ? `|${ymd}` : `|${a.end_date}`}`;
    const cc = uniq([corp, st === "OVERDUE" || a.days <= 30 ? head : null], pic);
    jobs.push({ entity: "agreement", entityId: a.id, code: a.code, stage: st, key, to: pic, cc, days: a.days, title: a.title, unit: a.unit_name ?? a.counterparty ?? "Korporat", sent: sent.has(key),
      subject: `[${st.startsWith("NOTICE") ? "NOTICE" : st}] ${a.code} ${a.title} — ${st === "OVERDUE" ? `lewat ${-a.days} hari` : `berakhir ${a.end_date ? formatDate(a.end_date) : ""}`}` });
  }
  return jobs.sort((x, y) => Number(x.sent) - Number(y.sent) || x.days - y.days);
}

/* ---------- acknowledge via email (HMAC link) ---------- */

const secret = () => process.env.AUTH_SECRET || process.env.ACCESS_CODE || "dev-only-secret";
export const ackToken = (permitId: number, memberId: number) =>
  createHmac("sha256", secret()).update(`ack|${permitId}|${memberId}`).digest("base64url").slice(0, 32);
export const ackUrl = (permitId: number, memberId: number) => `${appUrl()}/ack?p=${permitId}&m=${memberId}&t=${ackToken(permitId, memberId)}`;
export const verifyAck = (permitId: number, memberId: number, t: string) => t.length === 32 && t === ackToken(permitId, memberId);

/* ---------- email template (§5.7) ---------- */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderEmail(j: Job): string {
  const p = j.permit;
  const badge = j.stage === "OVERDUE" ? "SUDAH KEDALUWARSA" : j.stage === "H-0" ? "JATUH TEMPO HARI INI" : j.stage === "SOMASI" ? "BERSOMASI — WAJIB ACKNOWLEDGE" : `JATUH TEMPO ${j.stage}`;
  const headline = j.stage === "OVERDUE" ? `${j.title} sudah kedaluwarsa ${-j.days} hari` : j.stage === "H-0" ? `${j.title} jatuh tempo hari ini` : j.stage === "SOMASI" ? `${j.title} bersomasi dan menunggu acknowledge` : `${j.title} akan kedaluwarsa dalam ${j.days} hari`;
  const sisa = j.days < 0 ? `Terlewat ${-j.days} hari` : j.days === 0 ? "Jatuh tempo hari ini" : `${j.days} hari`;
  const rows: [string, string][] = p
    ? [["Unit", p.unit_name], ["Jenis izin", p.type_name], ["Nomor", p.number ?? "—"], ["Jatuh tempo", p.expiry_date ? formatDate(p.expiry_date) : "—"], ["Sisa waktu", sisa],
      ["Status renewal", RENEWAL_LABEL[p.renewal_status]], ["Instansi", p.agency ?? "—"], ["Estimasi biaya", p.est_cost ? `Rp ${Number(p.est_cost).toLocaleString("id-ID")}` : "—"], ["PIC Legal", p.pic_name ?? "—"]]
    : [["Perjanjian", `${j.code} — ${j.title}`], ["Pihak / unit", j.unit], ["Sisa waktu", sisa]];
  const link = `${appUrl()}/${j.entity === "permit" ? `perizinan?pic=all&d=${j.code}` : `perjanjian?d=${j.code}`}`;
  const ack = p && p.requires_ack && j.to ? ackUrl(p.id, j.to.id) : null;
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:#16181D;font-size:14px">
  <div style="display:inline-block;background:${j.days <= 0 || j.stage === "SOMASI" ? "#C41E29" : "#FFF4E2"};color:${j.days <= 0 || j.stage === "SOMASI" ? "#fff" : "#8A5A0B"};font-weight:700;font-size:11px;letter-spacing:.06em;padding:4px 9px;border-radius:6px">${badge}</div>
  <h2 style="font-size:18px;margin:14px 0 6px">${esc(headline)}</h2>
  <p style="color:#5A6068;margin:0 0 14px">Halo ${esc(j.to?.name ?? "Tim Legal")}, ini pengingat otomatis LDMS untuk dokumen yang Anda pegang.${p?.blocker_note ? ` Perhatian: ${esc(p.blocker_note)}.` : ""}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6B727B;width:150px">${k}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>
  ${p?.requires_ack ? `<div style="margin:16px 0;padding:12px 14px;border:1px solid #F6DDE0;background:#FDF2F3;border-radius:10px;color:#8E121A"><b>BERSOMASI</b><br>${esc(p.somasi_text ?? "")}</div>` : ""}
  <p style="margin:18px 0">${ack ? `<a href="${ack}" style="background:#C41E29;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px">Acknowledge — saya terima &amp; tindak lanjuti</a>` : ""}<a href="${link}" style="background:#16181D;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Buka di LDMS</a></p>
  <p style="color:#6B727B;font-size:12px">Notifikasi internal tim Legal — tidak dikirim ke outlet. Legal DMS Boga Group.</p></div>`;
}

/* ---------- run ---------- */

export async function runScan(me: Member | null, mode: "simulate" | "send") {
  const jobs = (await computeQueue()).filter((j) => !j.sent);
  const flows = await getFlows();
  const canSend = mode === "send" && flows.reminder.sendEnabled && Boolean(emailChannel());
  let sentCount = 0;
  let failed = 0;
  if (canSend) {
    const { sendRaw } = await import("../notify");
    for (const j of jobs) {
      if (!j.to?.email) { failed++; continue; }
      try {
        await sendRaw([j.to.email], j.cc.map((c) => c.email).filter((e): e is string => !!e), j.subject, renderEmail(j));
        await query(`insert into reminders (entity, entity_id, stage, stage_key, to_list, cc_list, status) values ($1,$2,$3,$4,$5,$6,'sent') on conflict (stage_key) do nothing`,
          [j.entity, j.entityId, j.stage, j.key, j.to.email, j.cc.map((c) => c.email).filter(Boolean).join(", ")]);
        sentCount++;
      } catch (e) {
        failed++;
        await query(`insert into reminders (entity, entity_id, stage, stage_key, to_list, status, error) values ($1,$2,$3,$4,$5,'error',$6) on conflict (stage_key) do nothing`,
          [j.entity, j.entityId, j.stage, j.key, j.to.email, e instanceof Error ? e.message.slice(0, 300) : "error"]);
      }
    }
  }
  const summary = { at: new Date().toISOString(), mode: canSend ? "send" : "simulate", queued: jobs.length, sent: sentCount, failed, by: me?.name ?? "Sistem" };
  await setKV("reminder_last_run", summary);
  await audit(me, canSend ? "jalankan reminder" : "simulasi reminder", "reminder", "scan", `${jobs.length} antrean · ${sentCount} terkirim${failed ? ` · ${failed} gagal` : ""}`);
  return summary;
}

/** Weekly digest content (§5.7): per PIC Legal. */
export async function weeklyDigest() {
  const permits = await listPermits();
  const byPic = new Map<string, { overdue: number; d30: number; somasi: number; belum: number; cost: number }>();
  for (const p of permits) {
    const k = p.pic_name ?? "Tanpa PIC";
    const r = byPic.get(k) ?? { overdue: 0, d30: 0, somasi: 0, belum: 0, cost: 0 };
    if (p.days !== null && p.days < 0) r.overdue++;
    if (p.days !== null && p.days >= 0 && p.days <= 30) { r.d30++; r.cost += Number(p.est_cost ?? 0); }
    if (p.requires_ack && !p.ack_at) r.somasi++;
    if (p.days !== null && p.days <= p.lead_days && p.renewal_status === "belum") r.belum++;
    byPic.set(k, r);
  }
  return [...byPic.entries()].map(([pic, r]) => ({ pic, ...r })).sort((a, b) => b.overdue - a.overdue || b.d30 - a.d30);
}
