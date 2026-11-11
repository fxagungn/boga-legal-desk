"use server";
// Data Record › Cases and SIGAP.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { one, query } from "@/lib/db";
import { requireMember } from "@/lib/repo";
import { requireCan } from "@/lib/access";
import { audit } from "@/lib/ldms/permits";
import { CASE_STATUS, DOC_KINDS, getCaseConfig, nextCaseCode, publishCaseToKb, STAGES } from "@/lib/ldms/cases";
import { nextSigapCode, publishSigapToKb } from "@/lib/ldms/sigap";
import { appendCaseToKb } from "@/lib/drive";
import type { Result } from "@/app/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return v ? Number(v) : null;
};
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const nul = (v: string) => v || null;

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

/** Write a KB entry to the Google Doc Knowledge Base (when Drive is connected). Never blocks the save. */
async function toKbDoc(code: string) {
  try {
    const k = await one<{ title: string; summary: string | null; category: string | null; root_cause: string | null; investigation: string | null; sanction: string | null; outcome: string | null; lesson: string | null }>(
      `select title, summary, category, root_cause, investigation, sanction, outcome, lesson from kb_cases where code = $1`, [code]);
    if (k) await appendCaseToKb({ code, title: k.title, summary: k.summary ?? "", category: k.category ?? "", rootCause: k.root_cause ?? "", flow: k.investigation ?? "", decision: k.sanction ?? "", outcome: k.outcome ?? "", lesson: k.lesson ?? "" });
  } catch (e) {
    console.error("KB doc", e);
  }
}

const refresh = () => {
  revalidatePath("/cases");
  revalidatePath("/kb");
  revalidatePath("/repository/case");
};

export async function saveCaseAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "cases", "edit");
    const cfg = await getCaseConfig();
    const id = Number(str(f, "id")) || 0;
    const category = str(f, "category");
    const title = str(f, "title");
    if (!title) throw new Error("Judul case wajib diisi.");
    if (!cfg.categories.includes(category)) throw new Error("Pilih kategori case.");
    const risk = ["Rendah", "Sedang", "Tinggi"].includes(str(f, "risk")) ? str(f, "risk") : "Sedang";
    const status = str(f, "status");
    const vals = [
      category, title, Number(str(f, "unit_id")) || null, isoDate(str(f, "incident_date")), isoDate(str(f, "reported_date")), nul(str(f, "reporter")),
      nul(str(f, "counterparty")), nul(str(f, "forum")), risk, num(f, "exposure"), nul(str(f, "chronology")), nul(str(f, "root_cause_cat")),
      nul(str(f, "root_cause")), Number(str(f, "pic_id")) || null, nul(str(f, "external_counsel")), me.name,
    ];
    if (id) {
      const st = status in CASE_STATUS && status !== "selesai" ? status : null;
      await query(
        `update cases set category=$2, title=$3, unit_id=$4, incident_date=$5, reported_date=$6, reporter=$7, counterparty=$8, forum=$9, risk=$10, exposure=$11,
           chronology=$12, root_cause_cat=$13, root_cause=$14, pic_id=$15, external_counsel=$16, updated_by=$17, updated_at=now(),
           status = coalesce($18, status) where id=$1`,
        [id, ...vals, st],
      );
      const c = await one<{ code: string; status: string }>(`select code, status from cases where id = $1`, [id]);
      if (c?.status === "selesai") await publishCaseToKb(id);
      await audit(me, "ubah case", "case", c?.code ?? id, title);
    } else {
      const code = await nextCaseCode();
      const r = await one<{ id: number }>(
        `insert into cases (category, title, unit_id, incident_date, reported_date, reporter, counterparty, forum, risk, exposure, chronology, root_cause_cat,
           root_cause, pic_id, external_counsel, updated_by, code, status)
         values ($1,$2,$3,$4,coalesce($5, current_date),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'baru') returning id`,
        [...vals, code],
      );
      await query(`insert into case_steps (case_id, step_date, stage, handler, action, by_name) values ($1, coalesce($2::date, current_date), 'Laporan diterima', $3, 'Case dicatat di LDMS', $4)`,
        [r!.id, isoDate(str(f, "reported_date")), str(f, "reporter") || "Tim Legal", me.name]);
      await audit(me, "catat case", "case", code, `${category} — ${title}`);
      refresh();
      return `${code} tercatat`;
    }
    refresh();
  });
}

export async function addCaseStepAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "cases", "edit");
    const id = Number(str(f, "id"));
    const stage = str(f, "stage");
    const handler = str(f, "handler");
    const action = str(f, "action");
    if (!STAGES.includes(stage)) throw new Error("Pilih tahap.");
    if (!handler || !action) throw new Error("Isi penangan dan tindakan.");
    const c = await one<{ code: string; status: string }>(`select code, status from cases where id = $1`, [id]);
    if (!c) throw new Error("Case tidak ditemukan.");
    await query(`insert into case_steps (case_id, step_date, stage, handler, action, by_name) values ($1, coalesce($2::date, current_date), $3, $4, $5, $6)`,
      [id, isoDate(str(f, "step_date")), stage, handler, action, me.name]);
    // Moving through the flow moves the status along.
    const next = ["Proses hukum", "Negosiasi / mediasi", "Eskalasi", "Keputusan"].includes(stage) ? "proses" : stage === "Laporan diterima" ? null : "investigasi";
    if (next && c.status !== "selesai") await query(`update cases set status = case when status = 'proses' then status else $2 end, updated_at = now(), updated_by = $3 where id = $1`, [id, next, me.name]);
    await audit(me, "tambah alur case", "case", c.code, `${stage} — ${handler}`);
    refresh();
  });
}

export async function addCaseDocAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "cases", "edit");
    const id = Number(str(f, "id"));
    const kind = DOC_KINDS.includes(str(f, "kind")) ? str(f, "kind") : "Lainnya";
    const label = str(f, "label");
    const url = str(f, "url");
    if (!label) throw new Error("Isi nama dokumen.");
    if (url && !/^https?:\/\//i.test(url)) throw new Error("Link harus diawali https://");
    const c = await one<{ code: string }>(`select code from cases where id = $1`, [id]);
    if (!c) throw new Error("Case tidak ditemukan.");
    await query(`insert into case_docs (case_id, kind, label, url, doc_date, by_name) values ($1,$2,$3,$4,$5,$6)`, [id, kind, label, url || null, isoDate(str(f, "doc_date")), me.name]);
    await audit(me, "tambah berkas case", "case", c.code, `${kind}: ${label}`);
    refresh();
  });
}

export async function closeCaseAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "cases", "approve");
    const id = Number(str(f, "id"));
    const cfg = await getCaseConfig();
    const outcome = str(f, "outcome");
    const decision = str(f, "decision");
    const lesson = str(f, "lesson");
    if (!cfg.outcomes.includes(outcome)) throw new Error("Pilih hasil akhir.");
    if (!decision) throw new Error("Isi keputusan.");
    if (!lesson) throw new Error("Isi pelajaran — ini yang masuk ke Knowledge Base.");
    const c = await one<{ code: string }>(`select code from cases where id = $1`, [id]);
    if (!c) throw new Error("Case tidak ditemukan.");
    const closed = isoDate(str(f, "closed_at"));
    await query(
      `update cases set status = 'selesai', decision = $2, outcome = $3, settlement = $4, closed_at = coalesce($5::date, current_date), lesson = $6, preventive = $7,
         updated_at = now(), updated_by = $8 where id = $1`,
      [id, decision, outcome, num(f, "settlement"), closed, lesson, nul(str(f, "preventive")), me.name],
    );
    await query(`insert into case_steps (case_id, step_date, stage, handler, action, by_name) values ($1, coalesce($2::date, current_date), 'Penutupan', $3, $4, $3)`,
      [id, closed, me.name, `Ditutup: ${outcome}`]);
    const kb = await publishCaseToKb(id);
    if (kb) await toKbDoc(kb);
    await audit(me, "tutup case", "case", c.code, `${outcome}${kb ? ` · ${kb}` : ""}`);
    refresh();
    return kb ? `Case ditutup · masuk Knowledge Base ${kb}` : "Case ditutup";
  });
}

export async function reopenCaseAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "cases", "approve");
    const id = Number(str(f, "id"));
    const c = await one<{ code: string }>(`update cases set status = 'proses', updated_at = now(), updated_by = $2 where id = $1 returning code`, [id, me.name]);
    await query(`delete from kb_cases where case_id = $1`, [id]);
    await query(`update cases set kb_code = null where id = $1`, [id]);
    await audit(me, "buka kembali case", "case", c?.code ?? id);
    refresh();
  });
}

/* ---------- SIGAP ---------- */

export async function saveSigapAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    await requireCan(me, "sigap", "edit");
    const violation = str(f, "violation");
    const date = isoDate(str(f, "result_date"));
    if (!violation || !date) throw new Error("Isi tanggal dan pelanggaran.");
    const code = await nextSigapCode();
    const r = await one<{ id: number }>(
      `insert into sigap_results (code, ref, result_date, unit_id, category, violation, decision, root_cause, lesson, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [code, nul(str(f, "ref")), date, Number(str(f, "unit_id")) || null, nul(str(f, "category")), violation, nul(str(f, "decision")),
        nul(str(f, "root_cause")), nul(str(f, "lesson")), me.name],
    );
    const kb = await publishSigapToKb(r!.id);
    if (kb) await toKbDoc(kb);
    await audit(me, "catat hasil SIGAP", "sigap", code, violation);
    revalidatePath("/sigap");
    revalidatePath("/kb");
    return `${code} tercatat${kb ? ` · masuk Knowledge Base` : ""}`;
  });
}
