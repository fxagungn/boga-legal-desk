// Master data (always) and demo registry (unless SEED_DEMO=false) for the LDMS permit module.
type Q = { query: (text: string, params?: unknown[]) => Promise<unknown[]> };
type Scope = "outlet" | "central_kitchen" | "korporat";

const DINKES = "Dinas Kesehatan Kota/Kabupaten";
const LAB = "Labkesda / lab terakreditasi";
const K3 = "Disnakertrans — pengawasan K3";
const HYGIENE = "Menunggu jadwal pelatihan hygiene Dinas Kesehatan";

/** [code, name, kind, scope, validity years, lead days, est. cost, agency, blocker] — LIST PERIZINAN (JATUH TEMPO) + blueprint §5.1 */
export const PERMIT_TYPES: [string, string, "new" | "renewal", Scope, number, number, number | null, string, string | null][] = [
  ["NIB", "NIB / Izin Usaha", "renewal", "outlet", 5, 60, null, "OSS RBA — Kementerian Investasi/BKPM", null],
  ["RKL", "Ijin Reklame", "renewal", "outlet", 1, 30, 7_500_000, "Dinas PM & PTSP / Bapenda setempat", null],
  ["HLL", "Sertifikat Halal", "renewal", "outlet", 4, 60, 3_500_000, "BPJPH — Kementerian Agama", null],
  ["SLS", "Sertifikat Laik Sehat", "renewal", "outlet", 3, 60, 2_500_000, DINKES, HYGIENE],
  ["HPJ", "Sertifikat Pelatihan Hygiene Penanggung Jawab", "renewal", "outlet", 3, 60, 1_200_000, DINKES, HYGIENE],
  ["HPM", "Sertifikat Pelatihan Hygiene Penjamah Makanan", "renewal", "outlet", 3, 60, 2_800_000, DINKES, HYGIENE],
  ["LAB", "Tes Laboratorium", "renewal", "outlet", 1, 60, 1_850_000, LAB, HYGIENE],
  ["ULP", "Uji Lab Penjamah Makanan", "renewal", "outlet", 1, 60, 2_200_000, LAB, HYGIENE],
  ["SKP", "SKPL-A", "renewal", "outlet", 1, 45, 1_500_000, "Dinas Lingkungan Hidup", null],
  ["NPD", "NPWPD", "new", "outlet", 1, 14, null, "Bapenda Kota/Kabupaten", null],
  ["PHR", "Iuran Keanggotaan PHRI", "renewal", "outlet", 1, 7, 3_000_000, "PHRI Daerah", null],
  ["MB", "Izin Alkohol (SIUP-MB)", "renewal", "outlet", 1, 45, 9_500_000, "Dinas Perindustrian & Perdagangan", null],
  ["GST", "Izin Genset", "renewal", "outlet", 1, 30, 4_500_000, K3, null],
  ["LIS", "Izin Instalasi Listrik", "renewal", "outlet", 1, 30, 3_800_000, K3, null],
  ["LFT", "Izin Lift", "renewal", "outlet", 1, 30, 5_200_000, K3, null],
  ["WLK", "Wajib Lapor Ketenagakerjaan (WLKP)", "renewal", "korporat", 1, 4, null, "Kemnaker — WLKP Online", null],
  ["PP", "Peraturan Perusahaan", "renewal", "korporat", 2, 45, null, "Disnakertrans Provinsi", null],
  ["TKA", "Izin Kerja TKA", "renewal", "korporat", 1, 60, 18_000_000, "Kemnaker — Ditjen Binapenta", null],
  ["DPK", "DPKK TKA", "renewal", "korporat", 1, 60, 16_500_000, "Kemnaker — DPKK", null],
  ["BTF", "Pengesahan bejana tekan — Freezer", "renewal", "central_kitchen", 1, 14, 2_400_000, K3, null],
  ["BTC", "Pengesahan bejana tekan — Chiller", "renewal", "central_kitchen", 1, 14, 2_400_000, K3, null],
  ["L125", "Pengesahan instalasi listrik (125 KVA)", "renewal", "central_kitchen", 1, 14, 3_600_000, K3, null],
  ["L170", "Pengesahan instalasi listrik (170 KVA)", "renewal", "central_kitchen", 1, 14, 4_100_000, K3, null],
  ["BTM", "Pengesahan bejana tekan — Mesin Mixing", "renewal", "central_kitchen", 1, 14, 2_650_000, K3, null],
  ["BTV", "Pengesahan bejana tekan — Vacum Packing C500", "renewal", "central_kitchen", 1, 14, 2_650_000, K3, null],
  ["PTR", "Pengesahan instalasi penyalur petir", "renewal", "central_kitchen", 1, 14, 2_900_000, K3, null],
  ["CGL", "Pengesahan pemakaian Cargo Lift", "renewal", "central_kitchen", 1, 14, 3_200_000, K3, null],
  ["ACP", "Pengesahan pemakaian Air Compressor", "renewal", "central_kitchen", 1, 14, 2_300_000, K3, null],
  ["UPF", "Pengesahan pemakaian Upright Freezer", "renewal", "central_kitchen", 1, 14, 2_250_000, K3, null],
];

/** [name, has principal, principal, currency] */
export const BRANDS: [string, boolean, string | null, string][] = [
  ["Ebiga", false, null, "IDR"],
  ["Kimukatsu", true, "Kimukatsu Co., Ltd. (Jepang)", "USD"],
  ["Pepper Lunch", false, null, "IDR"],
  ["Hikiniku to Come", false, null, "IDR"],
  ["Shaburi Kintan", true, "Reins International Inc. (Jepang)", "USD"],
  ["Yakiniku Like", true, "Yakiniku Like Co., Ltd. (Jepang)", "SGD"],
  ["Paradise Dynasty", false, null, "IDR"],
];




export async function seedLdms(q: Q) {
  // Master data: insert missing rows, never overwrite what the team edited.
  for (const [i, [code, name, kind, scope, years, lead, cost, agency, blocker]] of PERMIT_TYPES.entries()) {
    await q.query(
      `insert into permit_types (code, name, kind, scope, validity_years, lead_days, est_cost, agency, blocker_note, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (code) do nothing`,
      [code, name, kind, scope, years, lead, cost, agency, blocker, i + 1],
    );
  }
  for (const [name, hasP, principal, currency] of BRANDS) {
    await q.query(`insert into brands (name, has_principal, principal_name, currency) values ($1,$2,$3,$4) on conflict (name) do nothing`, [name, hasP, principal, currency]);
  }

  // Demo data lives in seed2.ts (v2, real Boga outlets).
}
