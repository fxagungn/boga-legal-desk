// Knowledge Base, Government Inspection, Repository (Legal Opinion).
import { query } from "../db";

export interface KbCase {
  id: number; code: string; case_date: string | null; title: string; unit_label: string | null; brand: string | null; matrix_code: string | null;
  category: string | null; location: string | null; investigation: string | null; functions: string | null; decider: string | null;
  sanction: string | null; summary: string | null; chronology: string | null; reasoning: string | null; source: string; synced_at: string | null; is_demo: boolean;
  root_cause: string | null; outcome: string | null; lesson: string | null; case_code: string | null; sigap_code: string | null;
}
export const listKb = () => query<KbCase>(
  `select k.id, k.code, to_char(k.case_date,'YYYY-MM-DD') as case_date, k.title, k.unit_label, k.brand, k.matrix_code, k.category, k.location, k.investigation,
     k.functions, k.decider, k.sanction, k.summary, k.chronology, k.reasoning, k.source, k.synced_at, k.is_demo, k.root_cause, k.outcome, k.lesson,
     c.code as case_code, s.code as sigap_code
   from kb_cases k left join cases c on c.id = k.case_id left join sigap_results s on s.id = k.sigap_id
   order by k.case_date desc nulls last, k.code desc`,
);

export const INSPECTION_RESULTS = ["Sesuai", "Temuan minor", "Temuan mayor", "Sanksi administratif"] as const;
export const RESULT_CHIP: Record<string, string> = {
  Sesuai: "bg-ok-bg text-ok", "Temuan minor": "bg-[#fff4e2] text-[#8a5a0b]", "Temuan mayor": "bg-[#fde7e9] text-[#a5161f]", "Sanksi administratif": "bg-brand text-white",
};

export interface InspectionRow {
  id: number; code: string; insp_date: string; agency: string; kind: string | null; unit_id: number | null; unit_name: string | null;
  result: string; findings: string | null; follow_up: string | null; consequence: string | null; fine: string | null; pic_name: string | null;
  closed_at: string | null; next_expected: string | null; is_demo: boolean;
}
export const listInspections = () => query<InspectionRow>(
  `select i.id, i.code, to_char(i.insp_date,'YYYY-MM-DD') as insp_date, i.agency, i.kind, i.unit_id, u.name as unit_name, i.result, i.findings, i.follow_up,
     i.consequence, i.fine::text, m.name as pic_name, to_char(i.closed_at,'YYYY-MM-DD') as closed_at, to_char(i.next_expected,'YYYY-MM-DD') as next_expected, i.is_demo
   from inspections i left join units u on u.id = i.unit_id left join team_members m on m.id = i.pic_id order by i.insp_date desc`,
);

export const LIBRARY_KINDS = ["Legal Opinion", "Memo hukum", "Resume"] as const;
export interface LibraryRow { id: number; code: string; kind: string; doc_date: string | null; title: string; parties: string | null; core: string | null; key_points: string | null; outcome: string | null; file_url: string | null; is_demo: boolean }
export const listLibrary = () => query<LibraryRow>(
  `select id, code, kind, to_char(doc_date,'YYYY-MM-DD') as doc_date, title, parties, core, key_points, outcome, file_url, is_demo from library order by doc_date desc nulls last, code`,
);

export const LIB_PREFIX: Record<string, string> = { "Legal Opinion": "LIB-LO", "Memo hukum": "LIB-MM", Resume: "LIB-RES" };

/* ---------- AI (blueprint §11.3, §15.3, §15.4) ---------- */

export interface AdviceResult {
  ringkasan: string; catatan: string; keyakinan: string; poin: string[]; risiko: string[];
  referensi: { id: string; judul: string; kutipan: string; relevansi: number; relevan: string }[]; langkah: string[];
}

const GENERIC = `{"ringkasan":"3-5 kalimat","catatan":"peringatan bila record tidak cukup","keyakinan":"Tinggi|Sedang|Rendah","poin":["..."],"risiko":["..."],"referensi":[{"id":"LIB-…/INS-…","judul":"","kutipan":"verbatim","relevansi":0,"relevan":"1 kalimat"}],"langkah":["langkah konkret + penanggung jawab + tenggat"]}`;

export const LIBRARY_SYSTEM = `Anda penasihat hukum internal Boga Group (F&B multi-brand, 150+ outlet, Indonesia).
Dasar rekomendasi Anda HANYA: (a) Repository legal opinion & memo yang direkam perusahaan, (b) daftar agreement aktif (MLA, ULA, PKS), (c) Knowledge Base pelajaran dari case & SIGAP, (d) dokumen repository Google Drive bila diberikan. Jangan mengarang id dokumen atau kutipan.
Wajib menyitir id dokumen nyata (LIB-…, KB-…, MLA/ULA/PKS-…) beserta kutipan verbatim dari field inti/poin/pelajaran.
Bila record internal tidak memadai untuk isu ini, isi "catatan" dengan peringatan jujur dan turunkan keyakinan.
Bahasa Indonesia formal-legal, ringkas, actionable. Status rekomendasi adalah draft untuk approval Legal Supervisor.
Balas HANYA JSON valid dengan format: ${GENERIC}. "poin" = posisi dan klausul yang direkomendasikan. "risiko" = risiko bila permintaan pihak lawan diterima apa adanya.`;

export const INSPECTION_SYSTEM = `Anda penasihat kepatuhan internal Boga Group yang menyiapkan tim Legal menghadapi pemeriksaan instansi pemerintah di Indonesia.
Dasar Anda HANYA: (a) riwayat pemeriksaan yang terekam, (b) status perizinan unit tersebut saat ini. Jangan mengarang id pemeriksaan atau kutipan.
Wajib menyitir id pemeriksaan nyata beserta kutipan verbatim dari field temuan atau tindak lanjutnya.
Prioritaskan temuan yang BERULANG pada instansi yang sama — itu yang paling mungkin diperiksa lagi.
Bila belum ada riwayat pemeriksaan dari instansi tersebut, katakan terus terang di "catatan" dan susun persiapan berbasis kewajiban perizinan unit itu.
Bahasa Indonesia formal, ringkas, actionable. Balas HANYA JSON valid dengan format: ${GENERIC}`;
