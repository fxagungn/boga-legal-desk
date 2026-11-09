// Summary Matrix Disiplin, pengajuan sanksi, and the rules from blueprint §7–8.
import { query } from "../db";

export const LEVELS = ["ST", "SP1", "SP2", "SP3 NON PHK", "SP3 PHK"] as const;
export const LEVEL_LABEL: Record<string, string> = {
  ST: "Surat Teguran", SP1: "Surat Peringatan 1", SP2: "Surat Peringatan 2", "SP3 NON PHK": "Surat Peringatan 3 (non PHK)", "SP3 PHK": "Surat Peringatan 3 — PHK",
};
export const OCCURRENCES = ["1st Occurrence", "Repeat", "Severe Case"] as const;
export type Occurrence = (typeof OCCURRENCES)[number];

export interface MatrixRule { code: string; category: string; sub_category: string; s_1st: string; s_repeat: string; s_severe: string; appeal: string; authority: string; note: string | null; version: string | null }

export const listMatrix = () => query<MatrixRule>(`select code, category, sub_category, s_1st, s_repeat, s_severe, appeal, authority, note, version from matrix_rules order by sort, code`);
export const getRule = async (code: string) => (await query<MatrixRule>(`select code, category, sub_category, s_1st, s_repeat, s_severe, appeal, authority, note, version from matrix_rules where code = $1`, [code]))[0] ?? null;

export function matrixSanksi(r: MatrixRule | null, occ: string): string {
  if (!r) return "-";
  return occ === "Repeat" ? r.s_repeat : occ === "Severe Case" ? r.s_severe : r.s_1st;
}

export function levelRank(v: string | null | undefined): number {
  const t = String(v ?? "").toUpperCase();
  if (t.includes("SP3 PHK")) return 4;
  let best = -1;
  LEVELS.forEach((l, i) => { if (t.includes(l)) best = Math.max(best, i); });
  return best;
}

/** Deviation rule (§7.4). */
export function gapOf(std: string | null, final: string | null): boolean {
  if (!std || std === "-" || !final) return false;
  if (std.toUpperCase().includes("ATAU")) return !std.toUpperCase().split("ATAU").map((s) => s.trim()).some((o) => levelRank(o) === levelRank(final));
  return levelRank(std) !== levelRank(final);
}

/** Default decision: the matrix level, except "ATAU" / "-" cells where the submitter's proposal is used (§7.3). */
export function defaultFinal(std: string, proposed: string | null): string {
  if (std === "-" || std.toUpperCase().includes("ATAU")) return proposed || LEVELS[0];
  const r = levelRank(std);
  return r >= 0 ? LEVELS[r] : proposed || LEVELS[0];
}

export const PNS_STATUS: Record<string, { label: string; cls: string }> = {
  legal: { label: "Menunggu review Legal", cls: "bg-[#fff4e2] text-[#8a5a0b]" },
  hr: { label: "Menunggu review HR", cls: "bg-info-bg text-info" },
  done: { label: "Disetujui & tercatat", cls: "bg-ok-bg text-ok" },
  returned: { label: "Dikembalikan", cls: "bg-brand-soft text-brand" },
};

export interface PunishmentRow {
  id: number; code: string; submitter_fn: string; submitted_by: string | null; unit_id: number | null; unit_name: string | null;
  matrix_code: string; sub_category: string | null; category: string | null; occurrence: string; matrix_std: string; proposed: string | null;
  description: string; evidence_url: string | null; ai_level: string | null; ai_code: string | null; ai_reason: string | null;
  final: string | null; deviation_reason: string | null; legal_by: string | null; legal_at: string | null; hr_by: string | null; hr_at: string | null;
  status: string; rejected_reason: string | null; rejected_by: string | null; appeal: string | null; authority: string | null;
  kb_case_code: string | null; is_demo: boolean; created_at: string;
}

const PCOLS = `p.id, p.code, p.submitter_fn, p.submitted_by, p.unit_id, u.name as unit_name, p.matrix_code, r.sub_category, r.category, p.occurrence,
  p.matrix_std, p.proposed, p.description, p.evidence_url, p.ai_level, p.ai_code, p.ai_reason, p.final, p.deviation_reason, p.legal_by, p.legal_at,
  p.hr_by, p.hr_at, p.status, p.rejected_reason, p.rejected_by, p.appeal, p.authority, p.kb_case_code, p.is_demo, p.created_at`;
const PFROM = `from punishments p left join units u on u.id = p.unit_id left join matrix_rules r on r.code = p.matrix_code`;

export const listPunishments = () => query<PunishmentRow>(`select ${PCOLS} ${PFROM} order by case p.status when 'legal' then 0 when 'hr' then 1 when 'returned' then 2 else 3 end, p.created_at desc`);
export const getPunishment = async (id: number) => (await query<PunishmentRow>(`select ${PCOLS} ${PFROM} where p.id = $1`, [id]))[0] ?? null;

export async function nextCode(prefix: string, table: string) {
  const y = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const r = await query<{ n: number }>(`select coalesce(max(substring(code from '\\d+$')::int), 0) + 1 as n from ${table} where code like $1`, [`${prefix}-${y}-%`]);
  return `${prefix}-${y}-${String(r[0].n).padStart(3, "0")}`;
}

/** Compact matrix for prompts. */
export async function matrixForPrompt() {
  const rows = await listMatrix();
  return rows.map((m) => ({ kode: m.code, kategori: m.category, subKategori: m.sub_category, sanksi1st: m.s_1st, sanksiRepeat: m.s_repeat, sanksiSevere: m.s_severe, hakBanding: m.appeal, lineOfAuthority: m.authority }));
}

/* ---------- AI prompts (blueprint §15) ---------- */

export const APPLY_MATRIX_SYSTEM = `Anda asisten disiplin internal tim Legal Boga Group (F&B multi-brand, 150+ outlet).
DASAR PUTUSAN ANDA ADALAH SUMMARY MATRIX DISIPLIN yang diberikan — bukan kebiasaan masa lalu. Sanksi WAJIB diambil dari kolom sanksi pada baris kode pelanggaran yang berlaku, sesuai occurrence (1st Occurrence / Repeat / Severe Case). Jangan mengarang kode, sanksi, hak banding, atau line of authority di luar matrix.
Tugas utama: (1) verifikasi apakah kode/sub-kategori yang dipilih pengguna paling sesuai dengan substansi perbuatan pada kronologi — bila ada kode lain yang lebih tepat, sebutkan di kodeAlternatif beserta alasannya; (2) nilai occurrence yang tepat berdasarkan kronologi; (3) sebutkan sanksi baku dari matrix; (4) susun langkah investigasi dan administrasi sebelum sanksi diterbitkan.
Bila sel matrix memuat dua opsi ("SP3 NON PHK ATAU SP3 PHK"), jelaskan kriteria pembeda yang harus dibuktikan investigasi untuk memilih salah satunya — jangan memilih sepihak tanpa dasar pada kronologi.
Bila sel bernilai "-" untuk occurrence tersebut, katakan bahwa matrix tidak mengatur occurrence itu untuk kode tersebut dan arahkan ke kode/occurrence yang berlaku.
Konteks kasus historis hanya ilustrasi langkah pembuktian. TIDAK BOLEH dipakai untuk menaikkan atau menurunkan tingkat sanksi di luar matrix.
Sertakan hak banding (14 hari kalender) dan line of authority persis seperti tertulis pada baris matrix.
JANGAN menyebut atau meminta nama, inisial, atau identitas individu. Analisis berbasis perbuatan, unsur, dan dampak.
Bahasa: Indonesia formal-legal, ringkas. Rekomendasi berstatus draft untuk approval sesuai line of authority.
Balas HANYA JSON valid tanpa markdown fence:
{"tingkat":"SP2","label":"nama sanksi lengkap","kodeDipakai":"KS-06","occurrence":"1st Occurrence","banding":"...","authority":"...","skorKeyakinan":0,"keyakinanLabel":"Tinggi|Sedang|Rendah","cukupData":true,"catatanData":"","ringkasanAnalisis":"2-4 kalimat","dasar":[{"kode":"KS-06","judul":"sub-kategori","kutipan":"verbatim dari matrix","sanksiMatrix":"SP2","relevansi":0,"alasan":"..."}],"kodeAlternatif":{"ada":false,"kode":"","penjelasan":""},"faktorMemberatkan":["..."],"faktorMeringankan":["..."],"langkahLegal":["..."]}`;

export const VERIFY_SYSTEM = `Anda asisten disiplin internal tim Legal Boga Group. Dasar Anda HANYA Summary Matrix Disiplin yang diberikan — sanksi diambil dari kolom occurrence pada baris kode yang berlaku. Verifikasi apakah kode yang dipilih pengaju sesuai substansi perbuatan; bila kode lain lebih tepat, sebut kode itu beserta sanksinya menurut matrix. Jangan mengarang kode atau sanksi. Jangan menyebut identitas individu. Balas HANYA JSON: {"tingkat":"SP2","kode":"KS-06","alasan":"2-3 kalimat: kode yang tepat, kolom occurrence, dan unsur perbuatan yang memenuhinya"}`;

export interface ApplyResult {
  tingkat: string; label: string; kodeDipakai: string; occurrence: string; banding: string; authority: string; skorKeyakinan: number; keyakinanLabel: string;
  cukupData: boolean; catatanData: string; ringkasanAnalisis: string;
  dasar: { kode: string; judul: string; kutipan: string; sanksiMatrix: string; relevansi: number; alasan: string }[];
  kodeAlternatif: { ada: boolean; kode: string; penjelasan: string };
  faktorMemberatkan: string[]; faktorMeringankan: string[]; langkahLegal: string[];
}

/** Draft letter text (blueprint §8.4). Always a draft until approval completes. */
export function letterDraft(o: { level: string; number: string; unit: string; rule: MatrixRule | null; code: string; occurrence: string; description: string; date: string }) {
  const r = o.rule;
  const signer = r?.authority?.startsWith("LEGAL") ? "Legal Manager / Legal Supervisor" : r?.authority?.startsWith("HCO") ? "HCO (Human Capital Officer)" : "Atasan langsung bersama HR Business Partner";
  return [
    `DRAFT — ${LEVEL_LABEL[o.level] ?? o.level}`,
    `Nomor: ${o.number}`,
    `Tanggal: ${o.date}`,
    `Unit: ${o.unit}`,
    ``,
    `Kepada: [jabatan karyawan — diisi HR saat penerbitan]`,
    ``,
    `Perihal: ${LEVEL_LABEL[o.level] ?? o.level}`,
    ``,
    `Berdasarkan hasil pemeriksaan, perbuatan berikut termasuk pelanggaran kode ${o.code}${r ? ` — ${r.sub_category}` : ""} (${r?.category ?? ""}), occurrence: ${o.occurrence}.`,
    ``,
    `Uraian perbuatan:`,
    o.description,
    ``,
    `Dasar: Summary Matrix Disiplin Boga Group (${r?.version ?? "versi berlaku"}), Peraturan Perusahaan, Code of Conduct, dan SOP terkait.`,
    `Sanksi: ${LEVEL_LABEL[o.level] ?? o.level}${o.level.startsWith("SP") && o.level !== "SP3 PHK" ? ", berlaku 6 (enam) bulan sejak diterbitkan" : ""}.`,
    ``,
    `Hak banding: ${r?.appeal ?? "-"}. Banding diajukan tertulis paling lambat 14 (empat belas) hari kalender sejak surat ini diterima.`,
    `Line of authority: ${r?.authority ?? "-"}.`,
    ``,
    `Ditandatangani oleh: ${signer}`,
    ``,
    `Catatan: dokumen ini DRAFT dan baru berlaku setelah approval Legal dan HR selesai.`,
  ].join("\n");
}
