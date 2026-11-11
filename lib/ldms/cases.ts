// Data Record › Cases: one record per legal matter, from report to decision. Closed cases feed the
// Knowledge Base (insight + lesson); their files feed Repository › Berkas Case.
import { getKV, query, setKV } from "../db";

export interface CaseConfig { categories: string[]; rootCauses: string[]; forums: string[]; outcomes: string[] }

export const DEFAULT_CASE_CONFIG: CaseConfig = {
  categories: ["Sengketa komersial", "Pidana / laporan polisi", "Konsumen & regulator", "Ketenagakerjaan"],
  rootCauses: [
    "SOP tidak dijalankan", "Kontrak / dokumen lemah", "Kontrol internal lemah", "Kelalaian karyawan", "Fraud / itikad buruk",
    "Keamanan pangan / kualitas produk", "Komunikasi & layanan pelanggan", "Perizinan / kepatuhan", "Faktor eksternal",
  ],
  forums: ["Internal", "Somasi / negosiasi", "Mediasi", "Kepolisian", "Pengadilan Negeri", "PHI / Disnaker", "BPSK", "Regulator / instansi", "Arbitrase"],
  outcomes: ["Damai / settlement", "Menang", "Kalah", "Dicabut / tidak dilanjutkan", "Sanksi internal", "Ditutup tanpa tindak lanjut"],
};

export async function getCaseConfig(): Promise<CaseConfig> {
  const saved = (await getKV<Partial<CaseConfig>>("case_config")) ?? {};
  const out = { ...DEFAULT_CASE_CONFIG };
  for (const k of Object.keys(out) as (keyof CaseConfig)[]) {
    if (Array.isArray(saved[k]) && saved[k]!.length) out[k] = saved[k]!;
  }
  return out;
}
export const saveCaseConfig = (c: CaseConfig) => setKV("case_config", c);

export const CASE_STATUS = { baru: "Baru", investigasi: "Investigasi", proses: "Proses hukum", selesai: "Selesai" } as const;
export type CaseStatus = keyof typeof CASE_STATUS;
export const STATUS_CHIP: Record<CaseStatus, string> = {
  baru: "bg-info-bg text-info", investigasi: "bg-[#fff4e2] text-[#8a5a0b]", proses: "bg-brand-soft text-brand", selesai: "bg-ok-bg text-ok",
};
export const RISK_CHIP: Record<string, string> = { Rendah: "bg-mute-bg text-ink-2", Sedang: "bg-[#fff4e2] text-[#8a5a0b]", Tinggi: "bg-brand text-white" };

/** Stages of the handling flow (best practice: intake → fact finding → BA → escalation → resolution → closing). */
export const STAGES = ["Laporan diterima", "Investigasi & pengumpulan bukti", "Berita Acara", "Eskalasi", "Negosiasi / mediasi", "Proses hukum", "Keputusan", "Penutupan"];
export const DOC_KINDS = ["Berita Acara", "Bukti", "Laporan polisi", "Somasi / surat", "Kesepakatan", "Putusan", "Lainnya"];

export interface CaseRow {
  id: number; code: string; category: string; title: string; unit_id: number | null; unit_name: string | null; brand: string | null;
  incident_date: string | null; reported_date: string | null; reporter: string | null; counterparty: string | null; forum: string | null;
  risk: string; exposure: string | null; chronology: string | null; root_cause_cat: string | null; root_cause: string | null;
  pic_id: number | null; pic_name: string | null; external_counsel: string | null; status: CaseStatus; decision: string | null; outcome: string | null;
  settlement: string | null; closed_at: string | null; lesson: string | null; preventive: string | null; kb_code: string | null; is_demo: boolean;
  age_days: number; step_count: number; doc_count: number; updated_by: string | null;
}

const COLS = `c.id, c.code, c.category, c.title, c.unit_id, u.name as unit_name, b.name as brand,
  to_char(c.incident_date,'YYYY-MM-DD') as incident_date, to_char(c.reported_date,'YYYY-MM-DD') as reported_date, c.reporter, c.counterparty, c.forum,
  c.risk, c.exposure::text, c.chronology, c.root_cause_cat, c.root_cause, c.pic_id, m.name as pic_name, c.external_counsel, c.status, c.decision, c.outcome,
  c.settlement::text, to_char(c.closed_at,'YYYY-MM-DD') as closed_at, c.lesson, c.preventive, c.kb_code, c.is_demo,
  (coalesce(c.closed_at, (now() at time zone 'Asia/Jakarta')::date) - coalesce(c.reported_date, c.created_at::date))::int as age_days,
  (select count(*)::int from case_steps s where s.case_id = c.id) as step_count,
  (select count(*)::int from case_docs d where d.case_id = c.id) as doc_count, c.updated_by`;
const FROM = `from cases c left join units u on u.id = c.unit_id left join brands b on b.id = u.brand_id left join team_members m on m.id = c.pic_id`;

export const listCases = () => query<CaseRow>(`select ${COLS} ${FROM} order by (c.status = 'selesai'), c.reported_date desc nulls last, c.code desc`);
export const getCaseByCode = async (code: string) => (await query<CaseRow>(`select ${COLS} ${FROM} where upper(c.code) = upper($1)`, [code]))[0] ?? null;

export interface StepRow { id: number; step_date: string; stage: string; handler: string; action: string; by_name: string | null }
export const listSteps = (caseId: number) =>
  query<StepRow>(`select id, to_char(step_date,'YYYY-MM-DD') as step_date, stage, handler, action, by_name from case_steps where case_id = $1 order by step_date, id`, [caseId]);

export interface CaseDocRow { id: number; case_id: number; case_code: string; case_title: string; category: string; kind: string; label: string; url: string | null; doc_date: string | null; by_name: string | null; is_demo: boolean }
export const listCaseDocs = (caseId?: number) => query<CaseDocRow>(
  `select d.id, d.case_id, c.code as case_code, c.title as case_title, c.category, d.kind, d.label, d.url, to_char(d.doc_date,'YYYY-MM-DD') as doc_date, d.by_name, c.is_demo
   from case_docs d join cases c on c.id = d.case_id ${caseId ? "where d.case_id = $1" : ""} order by d.doc_date desc nulls last, d.id desc`,
  caseId ? [caseId] : [],
);

export async function nextCaseCode() {
  const y = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const r = await query<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from cases where code like $1`, [`CASE-${y}-%`]);
  return `CASE-${y}-${String(r[0].n).padStart(3, "0")}`;
}

/** A closed case with a lesson becomes (or refreshes) a Knowledge Base entry. Returns the KB code. */
export async function publishCaseToKb(caseId: number): Promise<string | null> {
  const c = (await query<CaseRow>(`select ${COLS} ${FROM} where c.id = $1`, [caseId]))[0];
  if (!c || c.status !== "selesai") return null;
  const steps = await listSteps(c.id);
  const flow = steps.map((s) => `${s.stage} — ${s.handler}`).join(" → ");
  const code = c.kb_code ?? `KB-${c.code}`;
  await query(
    `insert into kb_cases (code, case_date, title, unit_label, brand, category, location, summary, chronology, investigation, decider, sanction, reasoning,
       root_cause, outcome, lesson, case_id, source, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'case',$18)
     on conflict (code) do update set case_date = excluded.case_date, title = excluded.title, unit_label = excluded.unit_label, brand = excluded.brand,
       category = excluded.category, location = excluded.location, summary = excluded.summary, chronology = excluded.chronology, investigation = excluded.investigation,
       decider = excluded.decider, sanction = excluded.sanction, reasoning = excluded.reasoning, root_cause = excluded.root_cause, outcome = excluded.outcome,
       lesson = excluded.lesson, case_id = excluded.case_id, is_demo = excluded.is_demo`,
    [code, c.closed_at ?? c.reported_date, c.title, c.unit_name, c.brand, c.category, c.forum, null, c.chronology, flow || null,
      steps.filter((s) => s.stage === "Keputusan").map((s) => s.handler).join(", ") || null, c.decision, c.preventive,
      [c.root_cause_cat, c.root_cause].filter(Boolean).join(" — ") || null, c.outcome, c.lesson, c.id, c.is_demo],
  );
  if (c.kb_code !== code) await query(`update cases set kb_code = $2 where id = $1`, [c.id, code]);
  return code;
}

/* ---------- insight for the Knowledge Base ---------- */

export interface Insight {
  total: number; open: number; closed: number; exposureOpen: number; avgDaysToClose: number | null;
  byCategory: { name: string; n: number; open: number }[];
  byRootCause: { name: string; n: number }[];
  byOutcome: { name: string; n: number }[];
  sigap: { name: string; n: number }[];
}

export async function caseInsight(): Promise<Insight> {
  const [cases, sigap] = await Promise.all([
    listCases(),
    query<{ name: string; n: number }>(`select coalesce(nullif(category,''),'Lainnya') as name, count(*)::int as n from sigap_results group by 1 order by 2 desc`),
  ]);
  const count = (xs: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  };
  const closed = cases.filter((c) => c.status === "selesai");
  const cats = new Map<string, { n: number; open: number }>();
  for (const c of cases) {
    const x = cats.get(c.category) ?? { n: 0, open: 0 };
    x.n++;
    if (c.status !== "selesai") x.open++;
    cats.set(c.category, x);
  }
  return {
    total: cases.length, open: cases.length - closed.length, closed: closed.length,
    exposureOpen: cases.filter((c) => c.status !== "selesai").reduce((s, c) => s + Number(c.exposure ?? 0), 0),
    avgDaysToClose: closed.length ? Math.round(closed.reduce((s, c) => s + c.age_days, 0) / closed.length) : null,
    byCategory: [...cats.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n),
    byRootCause: count(cases.map((c) => c.root_cause_cat)),
    byOutcome: count(closed.map((c) => c.outcome)),
    sigap,
  };
}
