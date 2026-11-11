// SIGAP: a separate system for disciplinary cases, embedded in LDMS. Its results are recorded here
// (manually until the integration exists) and each result becomes a Knowledge Base entry.
import { query } from "../db";

export interface SigapRow {
  id: number; code: string; ref: string | null; result_date: string; unit_id: number | null; unit_name: string | null; brand: string | null;
  category: string | null; violation: string; decision: string | null; root_cause: string | null; lesson: string | null; kb_code: string | null; is_demo: boolean;
}

export const listSigap = () => query<SigapRow>(
  `select s.id, s.code, s.ref, to_char(s.result_date,'YYYY-MM-DD') as result_date, s.unit_id, u.name as unit_name, b.name as brand, s.category, s.violation,
     s.decision, s.root_cause, s.lesson, s.kb_code, s.is_demo
   from sigap_results s left join units u on u.id = s.unit_id left join brands b on b.id = u.brand_id order by s.result_date desc, s.code desc`,
);

export async function nextSigapCode() {
  const y = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const r = await query<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from sigap_results where code like $1`, [`SGP-${y}-%`]);
  return `SGP-${y}-${String(r[0].n).padStart(3, "0")}`;
}

/** Every SIGAP result is mirrored as a KB entry (no employee names: violation, decision, root cause, lesson). */
export async function publishSigapToKb(id: number): Promise<string | null> {
  const s = (await listSigap()).find((x) => x.id === id);
  if (!s) return null;
  const code = s.kb_code ?? `KB-${s.code}`;
  await query(
    `insert into kb_cases (code, case_date, title, unit_label, brand, category, summary, sanction, root_cause, lesson, outcome, sigap_id, source, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Sanksi internal',$11,'sigap',$12)
     on conflict (code) do update set case_date = excluded.case_date, title = excluded.title, unit_label = excluded.unit_label, brand = excluded.brand,
       category = excluded.category, summary = excluded.summary, sanction = excluded.sanction, root_cause = excluded.root_cause, lesson = excluded.lesson, is_demo = excluded.is_demo`,
    [code, s.result_date, s.violation, s.unit_name, s.brand, s.category ? `SIGAP · ${s.category}` : "SIGAP", s.violation, s.decision, s.root_cause, s.lesson, s.id, s.is_demo],
  );
  if (s.kb_code !== code) await query(`update sigap_results set kb_code = $2 where id = $1`, [s.id, code]);
  return code;
}
