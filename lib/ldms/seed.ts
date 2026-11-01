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

/** Demo units: [code, name, brand, scope, mall, city, alcohol, lift] */
const DEMO_UNITS: [string, string, string | null, Scope, string | null, string, boolean, boolean][] = [
  ["PLGI", "Pepper Lunch Grand Indonesia", "Pepper Lunch", "outlet", "Grand Indonesia", "Jakarta Pusat", false, false],
  ["PLPKW", "Pepper Lunch Pakuwon Mall", "Pepper Lunch", "outlet", "Pakuwon Mall", "Surabaya", false, false],
  ["KMSC", "Kimukatsu Senayan City", "Kimukatsu", "outlet", "Senayan City", "Jakarta Pusat", false, false],
  ["KMPIM", "Kimukatsu Pondok Indah Mall", "Kimukatsu", "outlet", "Pondok Indah Mall", "Jakarta Selatan", false, false],
  ["SKKK", "Shaburi Kintan Kota Kasablanka", "Shaburi Kintan", "outlet", "Kota Kasablanka", "Jakarta Selatan", true, false],
  ["SKSMS", "Shaburi Kintan Summarecon Mall Serpong", "Shaburi Kintan", "outlet", "Summarecon Mall Serpong", "Tangerang", true, false],
  ["YLCP", "Yakiniku Like Central Park", "Yakiniku Like", "outlet", "Central Park", "Jakarta Barat", true, false],
  ["YLMKG", "Yakiniku Like Mall Kelapa Gading", "Yakiniku Like", "outlet", "Mall Kelapa Gading", "Jakarta Utara", true, false],
  ["EBPS", "Ebiga Plaza Senayan", "Ebiga", "outlet", "Plaza Senayan", "Jakarta Pusat", false, false],
  ["HTCPIK", "Hikiniku to Come PIK Avenue", "Hikiniku to Come", "outlet", "PIK Avenue", "Jakarta Utara", false, true],
  ["PDPI", "Paradise Dynasty Plaza Indonesia", "Paradise Dynasty", "outlet", "Plaza Indonesia", "Jakarta Pusat", true, false],
  ["PDTP", "Paradise Dynasty Tunjungan Plaza", "Paradise Dynasty", "outlet", "Tunjungan Plaza", "Surabaya", true, true],
  ["CKCKR", "Central Kitchen Cikarang", null, "central_kitchen", null, "Bekasi", false, false],
  ["HO", "Head Office Boga Group", null, "korporat", null, "Jakarta Selatan", false, false],
];

const OUTLET_BASE = ["NIB", "RKL", "HLL", "SLS", "HPJ", "HPM", "LAB", "ULP", "SKP", "NPD", "PHR", "GST", "LIS"];

/** Deterministic PRNG so every fresh database gets the same demo set. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  const lock = (await q.query(
    `insert into app_settings (key, value) values ('ldms_demo_v1', 'true'::jsonb) on conflict (key) do nothing returning key`,
  )) as unknown[];
  if (lock.length === 0 || process.env.SEED_DEMO === "false") return;

  const brandId = new Map(((await q.query(`select id, name from brands`)) as { id: number; name: string }[]).map((b) => [b.name, b.id]));
  const types = new Map(((await q.query(`select id, code, lead_days, validity_years from permit_types`)) as { id: number; code: string; lead_days: number; validity_years: string | null }[]).map((t) => [t.code, t]));
  const people = (await q.query(`select id, name from team_members where active`)) as { id: number; name: string }[];
  const who = (first: string) => people.find((p) => p.name.toLowerCase().startsWith(first))?.id ?? null;
  const tika = who("destika"), dola = who("j dola"), salma = who("salma"), jala = who("jala");

  const rand = rng(20261101);
  const today = new Date(Date.now() + 7 * 3600_000);
  today.setUTCHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (n: number) => new Date(+today + n * 86_400_000);
  // Spread: a few overdue, a cluster inside the renewal window, the rest safe.
  const pickDays = () => {
    const r = rand();
    if (r < 0.05) return -Math.ceil(rand() * 20);
    if (r < 0.08) return Math.floor(rand() * 2);
    if (r < 0.16) return 2 + Math.floor(rand() * 6);
    if (r < 0.3) return 8 + Math.floor(rand() * 23);
    if (r < 0.42) return 31 + Math.floor(rand() * 30);
    return 61 + Math.floor(rand() * 600);
  };

  let n = 0;
  for (const [code, name, brand, scope, mall, city, alcohol, lift] of DEMO_UNITS) {
    const u = (await q.query(
      `insert into units (code, name, brand_id, scope, mall, city, area, is_demo) values ($1,$2,$3,$4,$5,$6,$7,true)
       on conflict (code) do update set name = excluded.name returning id`,
      [code, name, brand ? brandId.get(brand) ?? null : null, scope, mall, city, city === "Surabaya" ? "Jawa Timur" : "Jabodetabek"],
    )) as { id: number }[];
    const unitId = u[0].id;
    const codes = scope === "outlet"
      ? [...OUTLET_BASE, ...(alcohol ? ["MB"] : []), ...(lift ? ["LFT"] : [])]
      : PERMIT_TYPES.filter((t) => t[3] === scope).map((t) => t[0]);
    const pic = scope === "outlet" ? (["Pepper Lunch", "Kimukatsu", "Ebiga", "Hikiniku to Come"].includes(brand ?? "") ? tika : dola) : salma;

    for (const tc of codes) {
      const t = types.get(tc);
      if (!t) continue;
      const days = pickDays();
      const expiry = addDays(days);
      const years = Number(t.validity_years ?? 1);
      const issue = new Date(+expiry - Math.round(years * 365) * 86_400_000);
      const inWindow = days <= t.lead_days;
      const r = rand();
      const status = !inWindow ? "belum" : r < 0.45 ? "belum" : r < 0.8 ? "proses" : "submitted";
      n++;
      await q.query(`select nextval('permit_code_seq')`);
      await q.query(
        `insert into permits (code, unit_id, permit_type_id, number, issue_date, expiry_date, renewal_status, pic_id, is_demo, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,'Data contoh')`,
        [`D${String(n).padStart(4, "0")}`, unitId, t.id, `${tc}/${code}/${issue.getUTCFullYear()}/${String(100 + Math.floor(rand() * 900))}`,
          iso(issue), iso(expiry), status, tc === "TKA" || tc === "DPK" ? jala ?? pic : pic],
      );
    }
  }

  // Two documents under somasi, plus a few notes, so every panel has something to show.
  const somasi: [string, string, string][] = [
    ["PLGI", "RKL", "Somasi I — pengelola mal: signage tanpa izin reklame berlaku, diminta diturunkan dalam 7 hari."],
    ["SKKK", "SLS", "Teguran tertulis Dinas Kesehatan: Sertifikat Laik Sehat belum diperpanjang saat sidak 28 Okt 2026."],
  ];
  for (const [unit, tc, text] of somasi) {
    await q.query(
      `update permits p set requires_ack = true, somasi_text = $3, somasi_at = now() - interval '2 days', somasi_by = 'Jala Yuan',
         expiry_date = least(expiry_date, current_date + 5), renewal_status = 'proses'
       from units u, permit_types t where p.unit_id = u.id and p.permit_type_id = t.id and u.code = $1 and t.code = $2`,
      [unit, tc, text],
    );
  }
  const notes: [string, string, string][] = [
    ["PLGI", "RKL", "Sudah koordinasi dengan building management GI, materi signage baru diajukan ke Dinas PM & PTSP."],
    ["SKKK", "SLS", "Jadwal pelatihan hygiene Dinkes Jaksel baru dibuka 12 Nov. Peserta 3 orang sudah didaftarkan."],
    ["CKCKR", "BTF", "Teknisi PJK3 dijadwalkan riksa uji minggu depan."],
  ];
  for (const [unit, tc, body] of notes) {
    await q.query(
      `insert into notes (entity, entity_id, body, by_id, by_name, created_at)
       select 'permit', p.id, $3, p.pic_id, coalesce(m.name, 'Tim Legal'), now() - interval '1 day'
       from permits p join units u on u.id = p.unit_id join permit_types t on t.id = p.permit_type_id
       left join team_members m on m.id = p.pic_id where u.code = $1 and t.code = $2`,
      [unit, tc, body],
    );
  }
}
