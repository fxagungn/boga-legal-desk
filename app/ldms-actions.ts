"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { one, query } from "@/lib/db";
import { requireMember } from "@/lib/repo";
import { requireCan } from "@/lib/access";
import { aiJson, aiReady, logAi } from "@/lib/ai";
import { appendCaseToKb, searchDrive, syncKbFromDocs } from "@/lib/drive";
import { audit, listPermits } from "@/lib/ldms/permits";
import { AGR_KINDS, listAgreements, nextAgreementCode, type AgrKind } from "@/lib/ldms/agreements";
import { INSPECTION_RESULTS, INSPECTION_SYSTEM, LIB_PREFIX, LIBRARY_KINDS, LIBRARY_SYSTEM, listInspections, listKb, listLibrary, type AdviceResult } from "@/lib/ldms/history";
import { runScan } from "@/lib/ldms/reminders";
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

/** Next code like INS-2026-007 / KB-2026-003 for a table with a `code` column. */
async function nextCode(prefix: string, table: string) {
  const y = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const r = await one<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from ${table} where code like $1`, [`${prefix}-${y}-%`]);
  return `${prefix}-${y}-${String(r!.n).padStart(3, "0")}`;
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
      revalidatePath("/repository");
      return "Dokumen disimpan";
    }
    const prefix = LIB_PREFIX[kind];
    const n = (await one<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from library where code like $1`, [`${prefix}-%`]))!.n;
    const code = `${prefix}-${String(n).padStart(3, "0")}`;
    const r = await one<{ id: number }>(`insert into library (code, kind, doc_date, title, parties, core, key_points, outcome, file_url, updated_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [code, ...vals]);
    await audit(me, "tambah library", "library", r!.id, `${code} ${str(f, "title")}`);
    revalidatePath("/repository");
    return `${code} ditambahkan`;
  });
}

export async function libraryAdviceAction(input: { kind: string; counterparty: string; value: string; issue: string }): Promise<DataResult<AdviceResult>> {
  return runData(async () => {
    const me = await requireMember();
    await requireCan(me, "library", "view");
    if (input.issue.trim().length < 10) throw new Error("Tulis isu yang mau dikonsultasikan.");
    const lib = (await listLibrary()).map((l) => ({ id: l.code, jenis: l.kind, tanggal: l.doc_date, judul: l.title, pihak: l.parties, inti: l.core, poinKunci: l.key_points, outcome: l.outcome }));
    const kb = (await listKb()).map((k) => ({ id: k.code, judul: k.title, kategori: k.category, rootCause: k.root_cause, hasil: k.outcome, pelajaran: k.lesson }));
    const agr = (await listAgreements()).filter((a) => a.status === "aktif").map((a) => ({ id: a.code, jenis: a.kind, judul: a.title, pihak: a.counterparty, berakhir: a.end_date, skema: a.scheme, nilai: a.value, mataUang: a.currency, terminasi: a.termination_clause }));
    const drive = await searchDrive(`${input.kind} ${input.counterparty} ${input.issue}`, 4).catch(() => []);
    const user = [
      `REPOSITORY (LEGAL OPINION & MEMO):\n${JSON.stringify(lib)}`, `KNOWLEDGE BASE (pelajaran case & SIGAP):\n${JSON.stringify(kb.slice(0, 60))}`,
      `AGREEMENT AKTIF (ringkas):\n${JSON.stringify(agr.slice(0, 80))}`,
      drive.length ? `DOKUMEN REPOSITORY GOOGLE DRIVE (kutipan):\n${JSON.stringify(drive.map((d) => ({ file: d.name, kutipan: d.snippet.slice(0, 800) })))}` : "",
      `KONSULTASI:\n${JSON.stringify(input)}`,
    ].filter(Boolean).join("\n\n");
    return (await aiJson<AdviceResult>(me, "library", LIBRARY_SYSTEM, user, 2500)).data;
  });
}

/* ======================= KNOWLEDGE BASE ======================= */

/** A lesson written directly in the KB (most entries come from closed Cases and SIGAP results). */
export async function saveKbCaseAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "kb", "edit");
    const title = str(f, "title");
    const lesson = str(f, "lesson");
    if (!title || !lesson) throw new Error("Isi judul dan pelajaran.");
    const text = ["summary", "lesson", "root_cause"].map((k) => str(f, k)).join(" ");
    if (/\b(bapak|ibu|sdr\.?|saudara)\s+[A-Z]/.test(text)) throw new Error("Jangan cantumkan nama karyawan — tulis fungsi/jabatan saja.");
    const code = await nextCode("KB", "kb_cases");
    await query(
      `insert into kb_cases (code, case_date, title, unit_label, category, summary, root_cause, outcome, lesson, source)
       values ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9, 'app')`,
      [code, isoDate(str(f, "case_date")), title, str(f, "unit_label") || null, str(f, "category") || null, str(f, "summary") || null,
        str(f, "root_cause") || null, str(f, "outcome") || null, lesson],
    );
    let toDocs = false;
    try { toDocs = await appendCaseToKb({ code, title, summary: str(f, "summary"), category: str(f, "category"), rootCause: str(f, "root_cause"), flow: "", decision: "", outcome: str(f, "outcome"), lesson }); } catch (e) { console.error("KB append", e); }
    await audit(me, "tambah pelajaran KB", "kb", code, title);
    revalidatePath("/kb");
    return toDocs ? `${code} ditambahkan & ditulis ke Google Docs` : `${code} ditambahkan`;
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

export async function logDecision(module: string, input: unknown, output: unknown) {
  const me = await requireMember();
  await logAi(me, module, input, output);
}


/** Rows for the dashboard search, fetched the first time the search box is used (only modules the user may view). */
export async function searchRowsAction() {
  const me = await requireMember();
  const { can, getAccessCtx } = await import("@/lib/access");
  const { searchRows } = await import("@/lib/ldms/search");
  const a = await getAccessCtx();
  return searchRows((m) => can(a, me, m, "view"));
}
