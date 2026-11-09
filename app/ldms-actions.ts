"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { one, query } from "@/lib/db";
import { requireMember, type Member } from "@/lib/repo";
import { requireCan } from "@/lib/access";
import { aiJson, aiReady, logAi } from "@/lib/ai";
import { getFlows } from "@/lib/flows";
import { appUrl } from "@/lib/notify";
import { appendCaseToKb, saveLetterToDrive, searchDrive, syncKbFromDocs } from "@/lib/drive";
import { audit, listPermits } from "@/lib/ldms/permits";
import { AGR_KINDS, listAgreements, nextAgreementCode, type AgrKind } from "@/lib/ldms/agreements";
import {
  APPLY_MATRIX_SYSTEM, gapOf, getPunishment, getRule, LEVELS, letterDraft, listMatrix, matrixForPrompt, matrixSanksi, nextCode,
  OCCURRENCES, VERIFY_SYSTEM, type ApplyResult,
} from "@/lib/ldms/discipline";
import { INSPECTION_RESULTS, INSPECTION_SYSTEM, LIB_PREFIX, LIBRARY_KINDS, LIBRARY_SYSTEM, listInspections, listKb, listLibrary, type AdviceResult } from "@/lib/ldms/history";
import { runScan } from "@/lib/ldms/reminders";
import { formatDate } from "@/lib/time";
import type { Result } from "@/app/actions";

export type DataResult<T> = { ok: true; data: T; message?: string } | { error: string } | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return v ? Number(v) : null;
};
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

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
async function runData<T>(fn: () => Promise<T>): Promise<DataResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Gagal. Coba lagi." };
  }
}

/* ======================= AGREEMENTS ======================= */

export async function saveAgreementAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "agreement", "edit");
    const id = Number(str(f, "id")) || 0;
    const kind = str(f, "kind") as AgrKind;
    if (!id && !AGR_KINDS.includes(kind)) throw new Error("Pilih jenis perjanjian.");
    const v = {
      title: str(f, "title"), counterparty: str(f, "counterparty") || null, principal: str(f, "principal") || null, territory: str(f, "territory") || null,
      location: str(f, "location") || null, city: str(f, "city") || null, nature: str(f, "nature") || null, scheme: str(f, "scheme") || null,
      start_date: isoDate(str(f, "start_date")), end_date: isoDate(str(f, "end_date")), notice_days: num(f, "notice_days"), tenor: str(f, "tenor") || null,
      currency: str(f, "currency") || "IDR", value: num(f, "value"), unit_fee: num(f, "unit_fee"), royalty_pct: num(f, "royalty_pct"), fx_ref: str(f, "fx_ref") || null,
      termination_clause: str(f, "termination_clause") || null, renewal_option: str(f, "renewal_option") || null, file_url: str(f, "file_url") || null,
      pic_id: Number(str(f, "pic_id")) || null, brand_id: Number(str(f, "brand_id")) || null, unit_id: Number(str(f, "unit_id")) || null,
      parent_id: Number(str(f, "parent_id")) || null, status: str(f, "status") === "berakhir" ? "berakhir" : "aktif",
    };
    if (!v.title) throw new Error("Judul wajib diisi.");
    if (!v.end_date) throw new Error("Tanggal berakhir wajib diisi.");
    if (v.start_date && v.start_date > v.end_date) throw new Error("Tanggal mulai tidak boleh setelah tanggal berakhir.");
    const k = id ? (await one<{ kind: AgrKind }>(`select kind from agreements where id = $1`, [id]))?.kind : kind;
    if (k === "MLA") {
      const b = v.brand_id ? await one<{ has_principal: boolean; name: string }>(`select has_principal, name from brands where id = $1`, [v.brand_id]) : null;
      if (!b?.has_principal) throw new Error("MLA hanya untuk brand berprincipal (Kimukatsu, Shaburi Kintan, Yakiniku Like).");
      const dup = await one<{ code: string }>(`select code from agreements where kind = 'MLA' and brand_id = $1 and status = 'aktif' and id <> $2`, [v.brand_id, id]);
      if (dup && v.status === "aktif") throw new Error(`${b.name} sudah punya MLA aktif (${dup.code}). Satu MLA per brand.`);
    }
    if (k === "ULA") {
      if (!v.unit_id || !v.parent_id) throw new Error("ULA wajib punya outlet dan MLA induk.");
      const parent = await one<{ end_date: string; brand_id: number }>(`select to_char(end_date,'YYYY-MM-DD') as end_date, brand_id from agreements where id = $1`, [v.parent_id]);
      v.brand_id = parent?.brand_id ?? v.brand_id;
    }
    const cols = Object.keys(v) as (keyof typeof v)[];
    if (id) {
      await query(`update agreements set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now(), updated_by = $${cols.length + 2} where id = $1`,
        [id, ...cols.map((c) => v[c]), me.name]);
      await audit(me, "ubah perjanjian", "agreement", id, v.title);
      revalidatePath("/perjanjian");
      return "Perjanjian disimpan";
    }
    const code = await nextAgreementCode(kind);
    const r = await one<{ id: number }>(
      `insert into agreements (code, kind, ${cols.join(", ")}, updated_by) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}, $${cols.length + 3}) returning id`,
      [code, kind, ...cols.map((c) => v[c]), me.name],
    );
    await audit(me, "tambah perjanjian", "agreement", r!.id, `${code} ${v.title}`);
    revalidatePath("/perjanjian");
    return `${code} ditambahkan`;
  });
}

/* ======================= PUNISHMENT ======================= */

const hrSecret = () => process.env.AUTH_SECRET || process.env.ACCESS_CODE || "dev-only-secret";
export async function hrToken(id: number) {
  return createHmac("sha256", hrSecret()).update(`hr|${id}`).digest("base64url").slice(0, 32);
}

async function verifyPunishmentAi(me: Member, id: number) {
  const p = await getPunishment(id);
  if (!p) return;
  try {
    const rule = await getRule(p.matrix_code);
    const user = `SUMMARY MATRIX DISIPLIN:\n${JSON.stringify(await matrixForPrompt())}\n\nPENGAJUAN:\n${JSON.stringify({
      kodeDipilih: p.matrix_code, subKategori: rule?.sub_category, occurrence: p.occurrence, sanksiBakuMatrix: p.matrix_std, unit: p.unit_name, usulanAtasan: p.proposed, uraian: p.description,
    })}`;
    const { data } = await aiJson<{ tingkat: string; kode: string; alasan: string }>(me, "punishment", VERIFY_SYSTEM, user, 600);
    await query(`update punishments set ai_level = $2, ai_code = $3, ai_reason = $4, ai_at = now() where id = $1`, [id, data.tingkat, data.kode, data.alasan]);
  } catch (e) {
    // Fallback (§16): the matrix standard stays authoritative.
    await query(`update punishments set ai_level = matrix_std, ai_reason = $2, ai_at = now() where id = $1`, [id, `Verifikasi AI tidak tersedia (${e instanceof Error ? e.message.slice(0, 120) : "error"}); sanksi baku matrix tetap berlaku.`]);
  }
}

export async function submitPunishmentAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "punishment", "edit");
    const code = str(f, "matrix_code");
    const occ = str(f, "occurrence");
    const rule = await getRule(code);
    if (!rule) throw new Error("Pilih kode pelanggaran dari matrix.");
    if (!(OCCURRENCES as readonly string[]).includes(occ)) throw new Error("Pilih occurrence.");
    const desc = str(f, "description");
    if (desc.length < 20) throw new Error("Uraian perbuatan & bukti wajib diisi (minimal 20 karakter).");
    const proposed = str(f, "proposed");
    if (proposed && !(LEVELS as readonly string[]).includes(proposed)) throw new Error("Usulan sanksi tidak valid.");
    const std = matrixSanksi(rule, occ);
    const pns = await nextCode("PNS", "punishments");
    const r = await one<{ id: number }>(
      `insert into punishments (code, submitter_fn, submitted_by, submitted_by_id, unit_id, matrix_code, occurrence, matrix_std, proposed, description, evidence_url, appeal, authority)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [pns, str(f, "submitter_fn") || "Legal", me.name, me.id, Number(str(f, "unit_id")) || null, code, occ, std, proposed || null, desc, str(f, "evidence_url") || null, rule.appeal, rule.authority],
    );
    await audit(me, "ajukan sanksi", "punishment", r!.id, `${pns} · ${code} · ${occ} → ${std}`);
    const { after } = await import("next/server");
    after(() => verifyPunishmentAi(me, r!.id));
    revalidatePath("/sanksi");
    return `${pns} diajukan — sanksi baku matrix: ${std}`;
  });
}

async function decide(me: Member, id: number, stage: "legal" | "hr", final: string, reason: string, actorName: string) {
  const p = await getPunishment(id);
  if (!p) throw new Error("Pengajuan tidak ditemukan.");
  if (p.status !== stage) throw new Error(`Pengajuan ini tidak sedang menunggu review ${stage === "legal" ? "Legal" : "HR"}.`);
  if (!(LEVELS as readonly string[]).includes(final)) throw new Error("Pilih keputusan sanksi.");
  if (gapOf(p.matrix_std, final) && !reason.trim()) throw new Error("Keputusan menyimpang dari matrix — alasan pembeda wajib diisi.");
  if (stage === "legal") {
    await query(`update punishments set final = $2, deviation_reason = $3, legal_by = $4, legal_at = now(), status = 'hr' where id = $1`, [id, final, reason || null, actorName]);
  } else {
    await query(`update punishments set final = $2, deviation_reason = coalesce(nullif($3,''), deviation_reason), hr_by = $4, hr_at = now(), status = 'done' where id = $1`, [id, final, reason, actorName]);
    // Blueprint §7.1: approved → recorded as a KB precedent (and appended to the Google Doc when Drive is set up).
    const kb = await nextCode("YRS", "kb_cases");
    const q = await getPunishment(id);
    const rule = await getRule(p.matrix_code);
    const c = {
      code: kb, title: `${p.matrix_code} — ${rule?.sub_category.slice(0, 90) ?? ""}`, summary: p.description, chronology: p.description,
      investigation: "Diisi tim Legal: bukti, klarifikasi tertulis, BAP, dan administrasi yang dilakukan.", location: p.unit_name ?? "-",
      functions: `Pengaju: ${p.submitter_fn}. Pemutus: ${q?.legal_by ?? ""} (Legal), ${actorName} (HR).`,
      sanction: `${final} · ${p.matrix_code} · ${p.occurrence} (matrix: ${p.matrix_std})`,
      reasoning: q?.deviation_reason ? `Menyimpang dari matrix — alasan pembeda: ${q.deviation_reason}` : "Sesuai sanksi baku Summary Matrix Disiplin.",
    };
    await query(
      `insert into kb_cases (code, case_date, title, unit_label, matrix_code, category, location, investigation, functions, decider, sanction, summary, chronology, reasoning, source)
       values ($1, current_date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'app')`,
      [kb, c.title, p.unit_name, p.matrix_code, rule?.category ?? null, c.location, c.investigation, c.functions, `${q?.legal_by ?? ""} + ${actorName}`, c.sanction, c.summary, c.chronology, c.reasoning],
    );
    await query(`update punishments set kb_case_code = $2 where id = $1`, [id, kb]);
    try { await appendCaseToKb(c); } catch (e) { console.error("KB append", e); }
  }
  await audit(me, `approve ${stage === "legal" ? "Legal" : "HR"}`, "punishment", id, `${p.code} → ${final}${reason ? ` · ${reason}` : ""}`);
}

export async function approveLegalAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "punishment", "approve");
    await decide(me, Number(str(f, "id")), "legal", str(f, "final"), str(f, "reason"), me.name);
    revalidatePath("/sanksi");
    return "Disetujui Legal — menunggu review HR";
  });
}

/** HR approval inside LDMS (for accounts with approve rights, e.g. when HR is given an account). */
export async function approveHrInAppAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "punishment", "approve");
    await decide(me, Number(str(f, "id")), "hr", str(f, "final"), str(f, "reason"), `${me.name} (atas nama HR)`);
    revalidatePath("/sanksi");
    return "Disetujui & tercatat";
  });
}

/** HR approval from the signed email link (no LDMS account). */
export async function approveHrByLinkAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const id = Number(str(f, "id"));
    if (str(f, "t") !== (await hrToken(id))) throw new Error("Link tidak valid.");
    const name = str(f, "hr_name");
    if (name.length < 3) throw new Error("Isi nama Anda sebagai HR Business Partner.");
    if (str(f, "decision") === "reject") {
      const reason = str(f, "reason");
      if (!reason) throw new Error("Tulis alasan pengembalian.");
      await query(`update punishments set status = 'returned', rejected_reason = $2, rejected_by = $3, rejected_at = now() where id = $1 and status = 'hr'`, [id, reason, `${name} (HR)`]);
      await audit(null, "HR kembalikan", "punishment", id, `${name}: ${reason}`);
      return "Pengajuan dikembalikan ke Legal";
    }
    await decide({ id: 0, name: `${name} (HR)` } as Member, id, "hr", str(f, "final"), str(f, "reason"), `${name} (HR)`);
    return "Terima kasih — sanksi disetujui dan tercatat";
  });
}

export async function rejectPunishmentAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "punishment", "approve");
    const reason = str(f, "reason");
    if (!reason) throw new Error("Tulis alasan pengembalian.");
    const id = Number(str(f, "id"));
    await query(`update punishments set status = 'returned', rejected_reason = $2, rejected_by = $3, rejected_at = now() where id = $1 and status in ('legal','hr')`, [id, reason, me.name]);
    await audit(me, "tolak & kembalikan", "punishment", id, reason);
    revalidatePath("/sanksi");
    return "Dikembalikan ke pengaju";
  });
}

export async function hrLinkAction(id: number): Promise<DataResult<{ url: string; emails: string[]; sent: boolean }>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "punishment", "approve");
    const url = `${appUrl()}/hr/${id}?t=${await hrToken(id)}`;
    const emails = (await getFlows()).punishment.hrApprovers;
    let sent = false;
    const { emailChannel, sendRaw } = await import("@/lib/notify");
    if (emails.length && emailChannel()) {
      const p = await getPunishment(id);
      await sendRaw(emails, [], `[LDMS] Approval HR: ${p?.code} ${p?.matrix_code}`, `<p>Pengajuan sanksi ${p?.code} (${p?.matrix_code} · ${p?.occurrence}) menunggu review HR.</p><p><a href="${url}">Buka & putuskan</a></p>`);
      sent = true;
    }
    await audit(me, "kirim link HR", "punishment", id, sent ? emails.join(", ") : "link disalin manual");
    return { url, emails, sent };
  });
}

/* ======================= TERAPKAN MATRIX (AI) & SURAT ======================= */

export async function applyMatrixAction(input: { code: string; occurrence: string; unit: string; summary: string; chronology: string }): Promise<DataResult<{ result: ApplyResult; runId: string | null }>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "matrix_apply", "edit");
    const rule = await getRule(input.code);
    if (!rule) throw new Error("Pilih kode pelanggaran.");
    if (input.chronology.trim().length < 20) throw new Error("Kronologi & temuan wajib diisi (minimal 20 karakter).");
    const kb = (await listKb()).map((k) => ({ caseId: k.code, judul: k.title, kode: k.matrix_code, langkahInvestigasi: k.investigation }));
    const user = [
      `SUMMARY MATRIX DISIPLIN:\n${JSON.stringify(await matrixForPrompt())}`,
      `KODE YANG DIPILIH:\n${JSON.stringify(rule)}`,
      `OCCURRENCE: ${input.occurrence} → sanksi baku matrix: ${matrixSanksi(rule, input.occurrence)}`,
      `KONTEKS LANGKAH PEMBUKTIAN (KB, hanya ilustrasi):\n${JSON.stringify(kb)}`,
      `KASUS BARU:\n${JSON.stringify({ unit: input.unit, ringkasan: input.summary, kronologi: input.chronology })}`,
    ].join("\n\n");
    const { data, runId } = await aiJson<ApplyResult>(me, "matrix", APPLY_MATRIX_SYSTEM, user, 3000);
    return { result: data, runId };
  });
}

export async function recordMatrixDecisionAction(runId: string, level: string): Promise<DataResult<null>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "matrix_apply", "edit");
    await query(`update ai_runs set decided_value = $2, decided_by = $3, decided_at = now() where id = $1`, [runId, level, me.name]);
    await audit(me, "catat penerapan matrix", "ai_run", runId, level);
    return null;
  });
}

export async function letterAction(input: { source: string; sourceId: string; level: string; code: string; occurrence: string; unit: string; description: string; toDrive?: boolean }): Promise<DataResult<{ code: string; body: string; driveUrl: string | null }>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "punishment", "view");
    const rule = await getRule(input.code);
    const code = await nextCode("SRT", "letters");
    const body = letterDraft({ level: input.level, number: `${code}/LGL/BOGA`, unit: input.unit || "-", rule, code: input.code, occurrence: input.occurrence, description: input.description, date: formatDate(Date.now()) });
    let driveUrl: string | null = null;
    if (input.toDrive) driveUrl = await saveLetterToDrive(`${code} — Draft ${input.level} ${input.code}`, body);
    await query(`insert into letters (code, source, source_id, level, unit_label, body, drive_url, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [code, input.source, input.sourceId, input.level, input.unit, body, driveUrl, me.name]);
    await audit(me, "draft surat", "letter", code, `${input.level} · ${input.code}${driveUrl ? " · disimpan ke Drive" : ""}`);
    return { code, body, driveUrl };
  });
}

/* ======================= INSPECTION ======================= */

export async function saveInspectionAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "inspection", "edit");
    const id = Number(str(f, "id")) || 0;
    const date = isoDate(str(f, "insp_date"));
    const result = str(f, "result");
    if (!date) throw new Error("Isi tanggal pemeriksaan.");
    if (!str(f, "agency")) throw new Error("Isi instansi.");
    if (!(INSPECTION_RESULTS as readonly string[]).includes(result)) throw new Error("Pilih hasil pemeriksaan.");
    const vals = [date, str(f, "agency"), str(f, "kind") || null, Number(str(f, "unit_id")) || null, result, str(f, "findings") || null, str(f, "follow_up") || null,
      str(f, "consequence") || null, num(f, "fine"), Number(str(f, "pic_id")) || null, isoDate(str(f, "closed_at")), isoDate(str(f, "next_expected")), me.name];
    if (id) {
      await query(`update inspections set insp_date=$2, agency=$3, kind=$4, unit_id=$5, result=$6, findings=$7, follow_up=$8, consequence=$9, fine=$10, pic_id=$11, closed_at=$12, next_expected=$13, updated_by=$14 where id=$1`, [id, ...vals]);
      await audit(me, "ubah pemeriksaan", "inspection", id, str(f, "agency"));
      revalidatePath("/pemeriksaan");
      return "Pemeriksaan disimpan";
    }
    const code = await nextCode("INS", "inspections");
    const r = await one<{ id: number }>(`insert into inspections (code, insp_date, agency, kind, unit_id, result, findings, follow_up, consequence, fine, pic_id, closed_at, next_expected, updated_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`, [code, ...vals]);
    await audit(me, "catat pemeriksaan", "inspection", r!.id, `${code} ${str(f, "agency")}`);
    revalidatePath("/pemeriksaan");
    return `${code} dicatat`;
  });
}

export async function inspectionAdviceAction(input: { agency: string; unitId: number; kind: string; context: string }): Promise<DataResult<{ result: AdviceResult; due: { code: string; izin: string; jatuhTempo: string | null; sisa: number | null }[] }>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "inspection", "view");
    if (!input.agency.trim()) throw new Error("Isi instansi.");
    const unit = await one<{ name: string }>(`select name from units where id = $1`, [input.unitId]);
    const permits = (await listPermits()).filter((p) => p.unit_id === input.unitId);
    const due = permits.filter((p) => p.days !== null && p.days <= 120).sort((a, b) => (a.days ?? 0) - (b.days ?? 0)).map((p) => ({ code: p.code, izin: p.type_name, jatuhTempo: p.expiry_date, sisa: p.days }));
    const user = [
      `RIWAYAT PEMERIKSAAN TEREKAM:\n${JSON.stringify((await listInspections()).map((i) => ({ id: i.code, tanggal: i.insp_date, instansi: i.agency, jenis: i.kind, unit: i.unit_name, hasil: i.result, temuan: i.findings, tindakLanjut: i.follow_up, konsekuensi: i.consequence })))}`,
      `STATUS PERIZINAN UNIT ${unit?.name ?? "-"} SAAT INI:\n${JSON.stringify(permits.map((p) => ({ id: p.code, izin: p.type_name, sisaHari: p.days, jatuhTempo: p.expiry_date, statusRenewal: p.renewal_status, blocker: p.blocker_note })))}`,
      `PERMINTAAN:\n${JSON.stringify({ instansi: input.agency, unit: unit?.name, jenisPemeriksaan: input.kind, konteks: input.context })}`,
    ].join("\n\n");
    const { data } = await aiJson<AdviceResult>(me, "inspection", INSPECTION_SYSTEM, user, 2500);
    return { result: data, due };
  });
}

/* ======================= LIBRARY ======================= */

export async function saveLibraryAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "library", "edit");
    const id = Number(str(f, "id")) || 0;
    const kind = str(f, "kind");
    if (!(LIBRARY_KINDS as readonly string[]).includes(kind)) throw new Error("Pilih jenis dokumen.");
    if (!str(f, "title")) throw new Error("Judul wajib diisi.");
    const vals = [kind, isoDate(str(f, "doc_date")), str(f, "title"), str(f, "parties") || null, str(f, "core") || null, str(f, "key_points") || null, str(f, "outcome") || null, str(f, "file_url") || null, me.name];
    if (id) {
      await query(`update library set kind=$2, doc_date=$3, title=$4, parties=$5, core=$6, key_points=$7, outcome=$8, file_url=$9, updated_by=$10 where id=$1`, [id, ...vals]);
      await audit(me, "ubah library", "library", id, str(f, "title"));
      revalidatePath("/pustaka");
      return "Dokumen disimpan";
    }
    const prefix = LIB_PREFIX[kind];
    const n = (await one<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from library where code like $1`, [`${prefix}-%`]))!.n;
    const code = `${prefix}-${String(n).padStart(3, "0")}`;
    const r = await one<{ id: number }>(`insert into library (code, kind, doc_date, title, parties, core, key_points, outcome, file_url, updated_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [code, ...vals]);
    await audit(me, "tambah library", "library", r!.id, `${code} ${str(f, "title")}`);
    revalidatePath("/pustaka");
    return `${code} ditambahkan`;
  });
}

export async function libraryAdviceAction(input: { kind: string; counterparty: string; value: string; issue: string }): Promise<DataResult<AdviceResult>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "library", "view");
    if (input.issue.trim().length < 10) throw new Error("Tulis isu yang mau dikonsultasikan.");
    const lib = (await listLibrary()).map((l) => ({ id: l.code, jenis: l.kind, tanggal: l.doc_date, judul: l.title, pihak: l.parties, inti: l.core, poinKunci: l.key_points, outcome: l.outcome }));
    const agr = (await listAgreements()).filter((a) => a.status === "aktif").map((a) => ({ id: a.code, jenis: a.kind, judul: a.title, pihak: a.counterparty, berakhir: a.end_date, skema: a.scheme, nilai: a.value, mataUang: a.currency, terminasi: a.termination_clause }));
    const { query: q } = await import("@/lib/db");
    const types = await q(`select name, lead_days, est_cost, agency from permit_types where active order by sort`);
    const drive = await searchDrive(`${input.kind} ${input.counterparty} ${input.issue}`, 4).catch(() => []);
    const user = [
      `LIBRARY:\n${JSON.stringify(lib)}`, `AGREEMENT AKTIF (ringkas):\n${JSON.stringify(agr.slice(0, 80))}`,
      `ACUAN BIAYA & LEAD TIME PERIZINAN PER UNIT:\n${JSON.stringify(types)}`,
      drive.length ? `DOKUMEN REPOSITORY GOOGLE DRIVE (kutipan):\n${JSON.stringify(drive.map((d) => ({ file: d.name, kutipan: d.snippet.slice(0, 800) })))}` : "",
      `KONSULTASI:\n${JSON.stringify(input)}`,
    ].filter(Boolean).join("\n\n");
    return (await aiJson<AdviceResult>(me, "library", LIBRARY_SYSTEM, user, 2500)).data;
  });
}

/* ======================= KNOWLEDGE BASE ======================= */

export async function saveKbCaseAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "kb", "edit");
    const title = str(f, "title");
    if (!title) throw new Error("Judul case wajib diisi.");
    const text = ["summary", "chronology", "investigation", "functions", "reasoning"].map((k) => str(f, k)).join(" ");
    if (/\b(bapak|ibu|sdr\.?|saudara)\s+[A-Z]/.test(text)) throw new Error("Jangan cantumkan nama/inisial karyawan — tulis fungsi/jabatan saja.");
    const code = await nextCode("YRS", "kb_cases");
    const c = {
      code, title, summary: str(f, "summary"), chronology: str(f, "chronology"), investigation: str(f, "investigation"), location: str(f, "location"),
      functions: str(f, "functions"), sanction: str(f, "sanction"), reasoning: str(f, "reasoning"),
    };
    await query(
      `insert into kb_cases (code, case_date, title, unit_label, matrix_code, category, location, investigation, functions, sanction, summary, chronology, reasoning, source)
       values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'app')`,
      [code, isoDate(str(f, "case_date")), title, str(f, "unit_label") || null, str(f, "matrix_code") || null, str(f, "category") || null, c.location, c.investigation, c.functions, c.sanction, c.summary, c.chronology, c.reasoning],
    );
    let toDocs = false;
    try { toDocs = await appendCaseToKb(c); } catch (e) { console.error("KB append", e); }
    await audit(me, "tambah case KB", "kb", code, title);
    revalidatePath("/kb");
    return toDocs ? `${code} ditambahkan & ditulis ke Google Docs KB` : `${code} ditambahkan`;
  });
}

export async function syncKbAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "kb", "approve");
    const r = await syncKbFromDocs();
    await audit(me, "sinkron KB", "kb", "docs", `${r.cases} case${r.warnings.length ? ` · ${r.warnings.length} peringatan` : ""}`);
    revalidatePath("/kb");
    return `Sinkron selesai: ${r.cases} case dari Google Docs${r.warnings.length ? ` (${r.warnings.length} heading kurang)` : ""}`;
  });
}

/* ======================= REMINDER ======================= */

export async function runReminderAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "reminder", "approve");
    const r = await runScan(me, str(f, "mode") === "send" ? "send" : "simulate");
    revalidatePath("/reminder");
    return r.mode === "send" ? `${r.sent} email terkirim${r.failed ? `, ${r.failed} gagal` : ""}` : `Simulasi: ${r.queued} reminder akan dikirim (belum ada email yang keluar)`;
  });
}

export async function aiStatus() {
  return aiReady();
}

export async function matrixOptions() {
  return (await listMatrix()).map((m) => ({ code: m.code, label: `${m.code} — ${m.sub_category.length > 80 ? m.sub_category.slice(0, 78) + "…" : m.sub_category}` }));
}

export async function logDecision(module: string, input: unknown, output: unknown) {
  const me = await requireMember();
  await logAi(me, module, input, output);
}

