// Schema v9 seed: the 72-row Summary Matrix (master data) and demo data v2.
// Demo v2 replaces the earlier demo outlets with outlets that exist in Boga Group's public outlet list
// (Bank Mega partner list "Partners Boga Group – UPDATE"); mall and region are copied as written there.
// Everything demo is flagged is_demo and can be removed from Admin Console → Sistem.
import { MATRIX_ROWS, MATRIX_VERSION } from "./matrix-data";

type Q = { query: (text: string, params?: unknown[]) => Promise<unknown[]> };
type Scope = "outlet" | "central_kitchen" | "korporat";

/** [code, outlet name, brand, scope, mall, region (as listed), alcohol permit, lift permit] */
export const DEMO_UNITS_V2: [string, string, string | null, Scope, string | null, string | null, boolean, boolean][] = [
  ["PL-PS", "Pepper Lunch Plaza Senayan", "Pepper Lunch", "outlet", "Plaza Senayan", "Jabodetabek", false, false],
  ["PL-GI", "Pepper Lunch Grand Indonesia", "Pepper Lunch", "outlet", "Grand Indonesia", "Jabodetabek", false, false],
  ["PL-KK", "Pepper Lunch Kota Kasablanka", "Pepper Lunch", "outlet", "Kota Kasablanka", "Jabodetabek", false, false],
  ["PL-PKW", "Pepper Lunch Pakuwon Mall Surabaya", "Pepper Lunch", "outlet", "Pakuwon Mall", "Surabaya", false, false],
  ["KM-GI", "Kimukatsu Grand Indonesia", "Kimukatsu", "outlet", "Grand Indonesia", "Jabodetabek", false, false],
  ["KM-PIM3", "Kimukatsu PIM 3", "Kimukatsu", "outlet", "Pondok Indah Mall 3", "Jabodetabek", false, false],
  ["KM-CP", "Kimukatsu Central Park", "Kimukatsu", "outlet", "Central Park", "Jabodetabek", false, false],
  ["KM-TP", "Kimukatsu Tunjungan Plaza", "Kimukatsu", "outlet", "Tunjungan Plaza", "Surabaya", false, false],
  ["SK-PP", "Shaburi & Kintan Pacific Place", "Shaburi Kintan", "outlet", "Pacific Place", "Jabodetabek", true, false],
  ["SK-GC", "Shaburi & Kintan Gandaria City", "Shaburi Kintan", "outlet", "Gandaria City", "Jabodetabek", true, false],
  ["SK-SMS", "Shaburi & Kintan Summarecon Mall Serpong", "Shaburi Kintan", "outlet", "Summarecon Mall Serpong", "Jabodetabek", true, false],
  ["SK-PKW", "Shaburi & Kintan Pakuwon Mall Surabaya", "Shaburi Kintan", "outlet", "Pakuwon Mall", "Surabaya", true, false],
  ["YL-GI", "Yakiniku Like Grand Indonesia", "Yakiniku Like", "outlet", "Grand Indonesia", "Jabodetabek", false, false],
  ["YL-KK", "Yakiniku Like Kota Kasablanka", "Yakiniku Like", "outlet", "Kota Kasablanka", "Jabodetabek", false, false],
  ["YL-MKG", "Yakiniku Like Mall Kelapa Gading", "Yakiniku Like", "outlet", "Mall Kelapa Gading", "Jabodetabek", false, false],
  ["PD-PS", "Paradise Dynasty Plaza Senayan", "Paradise Dynasty", "outlet", "Plaza Senayan", "Jabodetabek", true, false],
  ["PD-CP", "Paradise Dynasty Central Park", "Paradise Dynasty", "outlet", "Central Park", "Jabodetabek", true, false],
  ["PD-CW", "Paradise Dynasty Ciputra World", "Paradise Dynasty", "outlet", "Ciputra World", "Surabaya", true, true],
  ["CK", "Central Kitchen", null, "central_kitchen", null, null, false, false],
  ["HO", "Head Office Boga Group", null, "korporat", null, "Tangerang", false, false],
];

const OUTLET_BASE = ["NIB", "RKL", "HLL", "SLS", "HPJ", "HPM", "LAB", "ULP", "SKP", "NPD", "PHR", "GST", "LIS"];

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedMatrix(q: Q) {
  for (const [i, [code, cat, sub, a, b, c, appeal, auth]] of MATRIX_ROWS.entries()) {
    await q.query(
      `insert into matrix_rules (code, category, sub_category, s_1st, s_repeat, s_severe, appeal, authority, version, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (code) do nothing`,
      [code, cat, sub, a, b, c, appeal, auth, MATRIX_VERSION, i + 1],
    );
  }
}

/** Remove every demo row (permits, units, agreements, cases …). Real data is never touched. */
export async function deleteDemo(q: Q) {
  for (const [entity, table] of [["permit", "permits"], ["agreement", "agreements"], ["punishment", "punishments"], ["inspection", "inspections"], ["library", "library"]]) {
    await q.query(`delete from notes where entity = $1 and entity_id in (select id from ${table} where is_demo)`, [entity]);
    await q.query(`delete from files where entity = $1 and entity_id in (select id from ${table} where is_demo)`, [entity]);
    await q.query(`delete from reminders where entity = $1 and entity_id in (select id from ${table} where is_demo)`, [entity]);
    await q.query(`delete from audit_log where entity = $1 and entity_id in (select id::text from ${table} where is_demo)`, [entity]);
  }
  await q.query(`delete from punishments where is_demo`);
  await q.query(`delete from agreements where is_demo and kind = 'ULA'`);
  await q.query(`delete from agreements where is_demo`);
  await q.query(`delete from permits where is_demo`);
  await q.query(`delete from inspections where is_demo`);
  await q.query(`delete from library where is_demo`);
  await q.query(`delete from kb_cases where is_demo`);
  await q.query(`delete from units u where u.is_demo and not exists (select 1 from permits p where p.unit_id = u.id)
     and not exists (select 1 from agreements a where a.unit_id = u.id) and not exists (select 1 from inspections i where i.unit_id = u.id)`);
}

export async function seedDemoV2(q: Q) {
  const lock = (await q.query(
    `insert into app_settings (key, value) values ('ldms_demo_v2', 'true'::jsonb) on conflict (key) do nothing returning key`,
  )) as unknown[];
  if (lock.length === 0 || process.env.SEED_DEMO === "false") return;

  await deleteDemo(q);
  const real = (await q.query(`select count(*)::int as n from permits`)) as { n: number }[];
  if (real[0].n === 0) await q.query(`select setval('permit_code_seq', 1, false)`);

  const brandId = new Map(((await q.query(`select id, name from brands`)) as { id: number; name: string }[]).map((b) => [b.name, b.id]));
  const types = new Map(((await q.query(`select id, code, lead_days, validity_years, scope from permit_types`)) as { id: number; code: string; lead_days: number; validity_years: string | null; scope: Scope }[]).map((t) => [t.code, t]));
  const people = (await q.query(`select id, name from team_members where active`)) as { id: number; name: string }[];
  const who = (first: string) => people.find((p) => p.name.toLowerCase().startsWith(first))?.id ?? null;
  const tika = who("destika"), dola = who("j dola"), salma = who("salma"), jala = who("jala"), virgy = who("virgiyanti");

  const rand = rng(20261109);
  const today = new Date(Date.now() + 7 * 3600_000);
  today.setUTCHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (n: number) => new Date(+today + n * 86_400_000);
  const pickDays = () => {
    const r = rand();
    if (r < 0.05) return -Math.ceil(rand() * 20);
    if (r < 0.08) return Math.floor(rand() * 2);
    if (r < 0.16) return 2 + Math.floor(rand() * 6);
    if (r < 0.3) return 8 + Math.floor(rand() * 23);
    if (r < 0.42) return 31 + Math.floor(rand() * 30);
    return 61 + Math.floor(rand() * 600);
  };

  const unitIds = new Map<string, number>();
  for (const [code, name, brand, scope, mall, city, alcohol, lift] of DEMO_UNITS_V2) {
    const u = (await q.query(
      `insert into units (code, name, brand_id, scope, mall, city, area, is_demo) values ($1,$2,$3,$4,$5,$6,$7,true)
       on conflict (code) do update set name = excluded.name, mall = excluded.mall, city = excluded.city returning id`,
      [code, name, brand ? brandId.get(brand) ?? null : null, scope, mall, city, city === "Surabaya" ? "Jawa Timur" : city === "Jabodetabek" ? "Jabodetabek" : null],
    )) as { id: number }[];
    const unitId = u[0].id;
    unitIds.set(code, unitId);
    const codes = scope === "outlet"
      ? [...OUTLET_BASE, ...(alcohol ? ["MB"] : []), ...(lift ? ["LFT"] : [])]
      : [...types.values()].filter((t) => t.scope === scope).map((t) => t.code);
    const pic = scope === "outlet" ? (["Pepper Lunch", "Kimukatsu"].includes(brand ?? "") ? tika : dola) : salma;
    for (const tc of codes) {
      const t = types.get(tc);
      if (!t) continue;
      const days = pickDays();
      const expiry = addDays(days);
      const issue = new Date(+expiry - Math.round(Number(t.validity_years ?? 1) * 365) * 86_400_000);
      const r = rand();
      const status = days > t.lead_days ? "belum" : r < 0.45 ? "belum" : r < 0.8 ? "proses" : "submitted";
      const n = ((await q.query(`select nextval('permit_code_seq')::int as n`)) as { n: number }[])[0].n;
      await q.query(
        `insert into permits (code, unit_id, permit_type_id, number, issue_date, expiry_date, renewal_status, pic_id, is_demo, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,'Data contoh')`,
        [`D${String(n).padStart(4, "0")}`, unitId, t.id, `${tc}/${code}/${issue.getUTCFullYear()}/${String(100 + Math.floor(rand() * 900))}`,
          iso(issue), iso(expiry), status, tc === "TKA" || tc === "DPK" ? jala ?? pic : pic],
      );
    }
  }

  const somasi: [string, string, string][] = [
    ["PL-GI", "RKL", "Somasi I — pengelola mal: signage tanpa izin reklame berlaku, diminta diturunkan dalam 7 hari."],
    ["SK-GC", "SLS", "Teguran tertulis Dinas Kesehatan: Sertifikat Laik Sehat belum diperpanjang saat sidak."],
  ];
  for (const [unit, tc, text] of somasi) {
    await q.query(
      `update permits p set requires_ack = true, somasi_text = $3, somasi_at = now() - interval '2 days', somasi_by = 'Jala Yuan',
         expiry_date = least(expiry_date, current_date + 5), renewal_status = 'proses'
       from units u, permit_types t where p.unit_id = u.id and p.permit_type_id = t.id and u.code = $1 and t.code = $2 and p.is_demo`,
      [unit, tc, text],
    );
  }
  const notes: [string, string, string][] = [
    ["PL-GI", "RKL", "[Contoh] Sudah koordinasi dengan building management, materi signage baru diajukan ke Dinas PM & PTSP."],
    ["SK-GC", "SLS", "[Contoh] Peserta pelatihan hygiene sudah didaftarkan untuk batch terdekat."],
    ["CK", "BTF", "[Contoh] Teknisi PJK3 dijadwalkan riksa uji minggu depan."],
  ];
  for (const [unit, tc, body] of notes) {
    await q.query(
      `insert into notes (entity, entity_id, body, by_id, by_name, created_at)
       select 'permit', p.id, $3, p.pic_id, coalesce(m.name, 'Tim Legal'), now() - interval '1 day'
       from permits p join units u on u.id = p.unit_id join permit_types t on t.id = p.permit_type_id
       left join team_members m on m.id = p.pic_id where u.code = $1 and t.code = $2 and p.is_demo`,
      [unit, tc, body],
    );
  }

  /* ---------- agreements (MLA per principal brand, ULA per outlet of that brand, PKS, PSM per outlet) ---------- */
  const date = (d: number) => iso(addDays(d));
  const principal: Record<string, [string, string, number, number]> = {
    // brand: [principal (blueprint §6.1), currency, royalty % (contoh), notice days (contoh)]
    Kimukatsu: ["Kimukatsu Co., Ltd. (Jepang)", "USD", 4, 180],
    "Shaburi Kintan": ["Reins International Inc. (Jepang)", "USD", 4, 180],
    "Yakiniku Like": ["Yakiniku Like Co., Ltd. (Jepang)", "SGD", 3, 365],
  };
  const mlaDays = [410, 96, 720];
  const mlaId = new Map<string, number>();
  let i = 0;
  for (const [brand, [pr, ccy, roy, notice]] of Object.entries(principal)) {
    const r = (await q.query(
      `insert into agreements (code, kind, brand_id, title, counterparty, principal, territory, tenor, currency, royalty_pct, notice_days, start_date, end_date, pic_id, is_demo, updated_by)
       values ($1,'MLA',$2,$3,$4,$4,'Republik Indonesia — eksklusif','10 tahun',$5,$6,$7,$8,$9,$10,true,'Data contoh') returning id`,
      [`MLA-${String(i + 1).padStart(3, "0")}`, brandId.get(brand) ?? null, `Master License Agreement — ${brand}`, pr, ccy, roy, notice,
        date(mlaDays[i] - 3650), date(mlaDays[i]), virgy],
    )) as { id: number }[];
    mlaId.set(brand, r[0].id);
    i++;
  }
  let u = 0;
  for (const [code, name, brand, scope, mall, city] of DEMO_UNITS_V2) {
    if (scope !== "outlet" || !brand || !principal[brand]) continue;
    const [, ccy, roy] = principal[brand];
    const d = [520, 210, 74, 900, 31, 640, 155, -12, 380, 47][u % 10];
    u++;
    await q.query(
      `insert into agreements (code, kind, parent_id, brand_id, unit_id, title, counterparty, location, city, tenor, currency, unit_fee, royalty_pct, fx_ref, start_date, end_date, notice_days, pic_id, is_demo, updated_by)
       values ($1,'ULA',$2,$3,$4,$5,$6,$7,$8,'5 tahun',$9,$10,$11,$12,$13,$14,90,$15,true,'Data contoh')`,
      [`ULA-${String(u).padStart(3, "0")}`, mlaId.get(brand), brandId.get(brand), unitIds.get(code), `Unit License Agreement — ${name}`, principal[brand][0],
        mall, city, ccy, (25 + Math.floor(rand() * 35)) * 1000, roy, `${ccy} — kurs tengah BI tanggal invoice`, date(d - 1825), date(d), virgy],
    );
  }
  const pks: [string, string, string, number, number, string][] = [
    ["Jasa kebersihan outlet area Jakarta", "[Contoh] Vendor jasa kebersihan", "Jasa · 2 tahun", 1_140_000_000, 118, "Notice 90 hari, penalti 1 bulan"],
    ["Pengelolaan limbah minyak jelantah", "[Contoh] Vendor pengelola limbah", "Jasa · 1 tahun", 96_000_000, 47, "Notice 60 hari, tanpa penalti"],
    ["Pengadaan daging sapi slice", "[Contoh] Pemasok daging", "Supply · 1 tahun", 8_400_000_000, 22, "Notice 90 hari, penalti 1 bulan"],
    ["Jasa keamanan Central Kitchen", "[Contoh] Vendor jasa keamanan", "Jasa · 2 tahun", 420_000_000, 260, "Notice 60 hari, tanpa penalti"],
    ["Sewa mesin POS & maintenance", "[Contoh] Vendor sistem POS", "Jasa · 3 tahun", 612_000_000, -8, "Notice 90 hari, penalti 1 bulan"],
    ["Jasa pest control seluruh outlet", "[Contoh] Vendor pest control", "Jasa · 1 tahun", 288_000_000, 75, "Notice 60 hari, tanpa penalti"],
  ];
  for (const [k, [title, cp, nature, value, d, term]] of pks.entries()) {
    await q.query(
      `insert into agreements (code, kind, title, counterparty, nature, currency, value, termination_clause, start_date, end_date, notice_days, pic_id, is_demo, updated_by)
       values ($1,'PKS',$2,$3,$4,'IDR',$5,$6,$7,$8,60,$9,true,'Data contoh')`,
      [`PKS-${String(k + 1).padStart(3, "0")}`, title, cp, nature, value, term, date(d - 365), date(d), salma],
    );
  }
  let s = 0;
  for (const [code, name, , scope, mall, city] of DEMO_UNITS_V2) {
    if (scope !== "outlet" || !mall) continue;
    const d = [830, 145, 62, 1240, 19, 470, 260, -25, 610, 95][s % 10];
    s++;
    await q.query(
      `insert into agreements (code, kind, unit_id, title, counterparty, location, city, scheme, currency, value, tenor, renewal_option, start_date, end_date, notice_days, pic_id, is_demo, updated_by)
       values ($1,'PSM',$2,$3,$4,$5,$6,$7,'IDR',$8,'5 tahun','Opsi perpanjangan 5 tahun',$9,$10,180,$11,true,'Data contoh')`,
      [`PSM-${String(s).padStart(3, "0")}`, unitIds.get(code), `Sewa menyewa — ${name}`, `Pengelola ${mall}`, mall, city,
        s % 3 === 0 ? "Fixed rent + service charge" : `Fixed vs revenue sharing ${8 + (s % 4)}%`, (140 + Math.floor(rand() * 190)) * 1_000_000,
        date(d - 1825), date(d), virgy],
    );
  }

  /* ---------- government inspections (contoh) ---------- */
  const ins: [string, number, string, string, string, string, string, string, string, number | null][] = [
    ["INS-2024-003", -1000, "Disnakertrans", "Pemeriksaan norma K3 — rutin tahunan", "CK", "Temuan minor", "Riksa uji bejana tekan chiller kedaluwarsa 1 bulan; dokumen riksa uji instalasi listrik 170 KVA tidak tersedia saat pemeriksaan.", "Pengajuan riksa uji ulang dalam 14 hari, dokumen K3 dikompilasi dalam satu binder di lokasi.", "Nota pemeriksaan, tanpa denda. Diminta lapor realisasi dalam 30 hari.", null],
    ["INS-2024-011", -865, "Dinas Kesehatan", "Inspeksi sanitasi & laik sehat", "KM-PIM3", "Temuan mayor", "Sertifikat pelatihan hygiene penjamah makanan habis untuk 3 dari 8 crew; log suhu chiller tidak terisi 4 hari.", "Pendaftaran pelatihan hygiene batch terdekat, penanggung jawab log harian, audit internal 2 minggu sekali.", "Teguran tertulis; laik sehat ditahan sampai bukti pelatihan diserahkan.", null],
    ["INS-2025-002", -657, "Satpol PP & Bapenda", "Penertiban reklame", "PL-KK", "Sanksi administratif", "Izin reklame lewat masa berlaku 21 hari; signage masih terpasang.", "Pembayaran pajak reklame terutang + denda, pengajuan izin baru, signage diturunkan sementara 5 hari.", "Denda administratif dan signage diturunkan 5 hari.", 4_200_000],
    ["INS-2025-018", -426, "Disnakertrans — Wasnaker", "Pemeriksaan norma kerja (WLKP & Peraturan Perusahaan)", "HO", "Temuan minor", "WLKP terlapor namun data jumlah karyawan tidak mutakhir; Peraturan Perusahaan tersisa 2 bulan tanpa proses pengesahan ulang.", "Pembaruan WLKP tiap kuartal, pengajuan pengesahan PP 60 hari sebelum berakhir.", "Nota pemeriksaan; bukti pengajuan PP diminta dalam 45 hari.", null],
    ["INS-2026-004", -206, "BPJPH & LPH", "Surveilan sertifikasi halal", "PL-GI", "Sesuai", "Dokumen SJPH lengkap; 1 bahan baku baru belum masuk daftar bahan disetujui.", "Penambahan bahan ke daftar melalui SIHALAL sebelum digunakan.", "Tidak ada sanksi; catatan surveilan ditutup.", null],
    ["INS-2026-009", -130, "Disperindag", "Pengawasan peredaran minuman beralkohol", "SK-PKW", "Temuan minor", "SIUP-MB berlaku, namun pencatatan stok dan penjualan MB tidak sesuai format pelaporan triwulan.", "Format pelaporan resmi, pelatihan kasir, rekonsiliasi stok MB bulanan oleh Finance.", "Pembinaan tertulis; wajib lapor triwulan tepat format 1 tahun.", null],
  ];
  for (const [code, d, agency, kind, unit, result, findings, follow, cons, fine] of ins) {
    await q.query(
      `insert into inspections (code, insp_date, agency, kind, unit_id, result, findings, follow_up, consequence, fine, pic_id, closed_at, next_expected, is_demo, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'Data contoh')`,
      [code, date(d), agency, kind, unitIds.get(unit) ?? null, result, findings, follow, cons, fine, unit === "HO" || unit === "CK" ? salma : dola, date(d + 30), date(d + 365)],
    );
  }

  /* ---------- library (contoh) ---------- */
  const lib: [string, string, number, string, string, string, string][] = [
    ["LIB-PSM-014", "PSM", -970, "Sewa menyewa — mal tier-1 Jakarta, skema revenue sharing", "Pengelola Grand Indonesia · 5 tahun", "Sewa dasar dengan revenue sharing 9% di atas threshold; kenaikan service charge maksimal 7% per tahun.", "Berhasil menegosiasikan cap kenaikan service charge 7%/tahun dan fit-out period 60 hari bebas sewa. Klausul relokasi wajib disertai kompensasi fit-out."],
    ["LIB-PSM-021", "PSM", -735, "Sewa menyewa — mal tier-2, fixed rent murni", "Pengelola Botani Square Bogor · 5 tahun", "Fixed rent tanpa revenue sharing; kenaikan 5% per 2 tahun.", "Tanpa cap service charge — menjadi pelajaran; tahun kedua service charge naik 14% dan tidak bisa ditolak."],
    ["LIB-PKS-008", "PKS", -657, "Kerja sama supply daging slice", "[Contoh] Pemasok daging · 1 tahun", "Harga terkunci 6 bulan pertama, penyesuaian maksimal 8% dengan notifikasi 30 hari.", "Reject rate >2% memberi hak pemotongan pembayaran; wajib sertifikat halal berlaku sepanjang kontrak."],
    ["LIB-PKS-012", "PKS", -510, "Kerja sama jasa kebersihan multi-outlet", "[Contoh] Vendor jasa kebersihan · 2 tahun", "SLA kehadiran 98%, penalti 0,5% nilai bulanan per pelanggaran SLA, notice termination 60 hari.", "Klausul no-poaching dua arah dan kewajiban vendor menanggung BPJS pekerjanya dengan bukti bulanan."],
    ["LIB-LA-004", "License", -436, "Amandemen MLA — penyesuaian royalty & minimum unit", "Principal Jepang · amandemen ke-2", "Royalty tetap, kewajiban pembukaan minimum unit diturunkan dari 5 menjadi 3 unit/tahun.", "Argumen yang berhasil: data okupansi mal dan biaya perizinan per unit yang meningkat."],
    ["LIB-LA-007", "License", -271, "ULA outlet baru — negosiasi unit fee & radius", "Principal Jepang · outlet baru", "Unit fee dengan proteksi radius 3 km dari outlet existing; tenor 5 tahun mengikuti MLA induk.", "Radius protection didapat setelah menunjukkan kanibalisasi penjualan outlet terdekat; unit fee dibayar 50/50."],
    ["LIB-LO-002", "Legal Opinion", -539, "Tanggung jawab perizinan pada outlet di dalam mal", "Diminta Ops Director", "Izin reklame dan laik sehat tetap kewajiban penyewa meski mal memiliki izin induk.", "Cantumkan pembagian kewajiban perizinan secara eksplisit di PSM untuk menghindari sengketa biaya dengan pengelola mal."],
    ["LIB-LO-005", "Legal Opinion", -397, "Konsekuensi operasional saat izin laik sehat kedaluwarsa", "Diminta Legal Manager", "Operasional tanpa sertifikat laik sehat berlaku memberi dasar penghentian sementara oleh Dinkes.", "Ambang pengajuan renewal H-60 karena jadwal pelatihan hygiene Dinkes sering menjadi bottleneck."],
    ["LIB-LO-009", "Legal Opinion", -230, "Batas kewenangan sanksi oleh atasan langsung", "Diminta HR", "Surat Teguran dapat diterbitkan atas usulan atasan langsung; SP1–SP3 wajib persetujuan Legal dan HR.", "Seluruh pengajuan sanksi dicatat dalam satu sistem dengan jejak approval."],
    ["LIB-RES-003", "Resume", -117, "Pola temuan pemeriksaan Disnakertrans 3 tahun terakhir", "Untuk rapat Ops & Legal", "Temuan berulang pada riksa uji peralatan Central Kitchen dan kemutakhiran data WLKP.", "Jadwalkan riksa uji serentak per semester dan perbarui WLKP setiap kuartal."],
  ];
  for (const [code, kind, d, title, parties, core, points] of lib) {
    await q.query(
      `insert into library (code, kind, doc_date, title, parties, core, key_points, is_demo, updated_by) values ($1,$2,$3,$4,$5,$6,$7,true,'Data contoh')`,
      [code, kind, date(d), title, parties, core, points],
    );
  }

  /* ---------- knowledge base (contoh; no names, functions only) ---------- */
  const kb: [string, number, string, string, string, string, string, string, string, string, string, string, string, string][] = [
    ["YRS-2024-011", -965, "Void bill tanpa otorisasi & selisih setoran kas", "Kimukatsu Grand Indonesia", "Kimukatsu", "FK-06-D", "Fraud & Kriminal", "Area kasir, shift sore", "Fungsi kasir (disaksikan SPV shift)", "Legal Manager + HR Business Partner", "SP3 PHK", "Void bill 14 kali setelah pembayaran tunai diterima; selisih setoran dalam 3 minggu.", "Temuan dari rekonsiliasi POS vs setoran, dikonfirmasi CCTV, pengakuan tercatat dalam BAP.", "Rekonsiliasi POS vs setoran kas 3 minggu → rekaman CCTV kasir jam void → pencocokan timestamp → klarifikasi tertulis → BAP dengan saksi SPV shift → perhitungan kerugian final oleh Finance.|Unsur kesengajaan dan pengulangan sistematis, kerugian finansial langsung, pengakuan dalam BAP. FK-06-D 1st → SP3 PHK sesuai matrix."],
    ["YRS-2024-027", -785, "Penggunaan bahan melewati masa simpan", "Pepper Lunch Plaza Senayan", "Pepper Lunch", "QA-01", "Temuan Audit QA", "Kitchen — chiller station", "Fungsi crew kitchen & SPV shift", "Legal Officer + QA Manager", "ST", "Audit QA menemukan item tanpa label tanggal dan 1 item melewati shelf life 2 hari.", "Audit rutin QA, tidak ada komplain pelanggan, produk belum tersaji.", "Audit QA dengan checklist FIFO → foto item → log suhu chiller 7 hari → klarifikasi crew dan SPV → verifikasi produk belum tersaji → rekomendasi QA Manager.|Tidak ada dampak ke pelanggan dan tidak ada kesengajaan, namun temuan major kedua dalam 6 bulan → QA-01 Repeat → ST sesuai matrix."],
    ["YRS-2025-021", -508, "Merokok di area belakang dapur", "Paradise Dynasty Plaza Senayan", "Paradise Dynasty", "KS-04", "Kepatuhan SOP & kebijakan perusahaan", "Area belakang dekat gudang kering", "Fungsi crew kitchen", "Legal Officer", "ST", "Merokok di luar smoking area; tidak ada kerusakan material.", "Dilaporkan rekan kerja, dikonfirmasi SPV, diakui dalam klarifikasi.", "Laporan rekan kerja → konfirmasi SPV → dokumentasi → klarifikasi tertulis → penilaian risiko kebakaran bersama tim K3.|1st Occurrence KS-04 → ST sesuai matrix."],
    ["YRS-2025-029", -458, "Merokok berulang, memicu alarm asap", "Kimukatsu Central Park", "Kimukatsu", "KS-04", "Kepatuhan SOP & kebijakan perusahaan", "Gudang kering", "Fungsi crew kitchen", "Legal Manager + Ops Manager", "SP1", "Merokok di area terlarang memicu alarm asap dan evakuasi sebagian area mal.", "Alarm aktif, evakuasi 20 menit, teguran dari pengelola mal.", "Waktu alarm & durasi evakuasi → CCTV gudang → koordinasi pengelola mal → klarifikasi tertulis → pemeriksaan pelanggaran sejenis.|Repeat KS-04 → SP1 sesuai matrix; dampak ke pihak ketiga dicatat sebagai faktor memberatkan pembuktian."],
    ["YRS-2025-041", -342, "Diskon karyawan dipakai untuk transaksi pihak luar", "Pepper Lunch Kota Kasablanka", "Pepper Lunch", "FK-03", "Fraud & Kriminal", "Kasir", "Fungsi crew service", "Legal Manager + Finance Controller", "SP1", "Employee discount dipakai untuk 22 transaksi pelanggan umum.", "Terdeteksi dari anomali laporan diskon POS; tidak ada bukti penerimaan uang tambahan.", "Anomali laporan diskon POS → tarik 22 bill → cocokkan pemegang → klarifikasi → verifikasi mutasi/QRIS → kerugian margin oleh Finance.|1st Occurrence FK-03 → SP1 sesuai matrix."],
    ["YRS-2026-006", -240, "Izin reklame kedaluwarsa, outlet ditegur pengelola mal", "Pepper Lunch Kota Kasablanka", "Pepper Lunch", "PT-04-A", "Produktivitas & Tanggung Jawab", "Fasad outlet", "Fungsi PIC dokumen", "Legal Manager", "SP1", "Izin reklame lewat masa berlaku 21 hari; pengelola mal meminta penurunan signage.", "Reminder H-30 terkirim namun tidak ditindaklanjuti.", "Verifikasi registry → jejak reminder → konfirmasi teguran mal → klarifikasi PIC → status renewal di instansi.|Kelalaian berdampak minor → PT-04-A 1st → SP1."],
  ];
  for (const [code, d, title, unit, brand, mcode, cat, loc, fn, dec, sanc, sum, chrono, rest] of kb) {
    const [inv, reason] = rest.split("|");
    await q.query(
      `insert into kb_cases (code, case_date, title, unit_label, brand, matrix_code, category, location, functions, decider, sanction, summary, chronology, investigation, reasoning, source, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'demo',true)`,
      [code, date(d), title, unit, brand, mcode, cat, loc, fn, dec, sanc, sum, chrono, inv, reason],
    );
  }

  /* ---------- punishments (contoh: one per stage) ---------- */
  const pn: [string, string, string, string, string, string, string, string, string | null][] = [
    ["PNS-2026-001", "Outlet Manager", "PL-PS", "KS-04", "1st Occurrence", "ST", "SP1", "[Contoh] Crew merokok di area loading di luar jam istirahat; dilaporkan SPV shift, foto tersedia.", "legal"],
    ["PNS-2026-002", "Area Manager", "KM-GI", "PT-05-A", "1st Occurrence", "SP1", "SP1", "[Contoh] Kegagalan pengawasan pencatatan suhu chiller selama 3 hari; tidak ada produk tersaji bermasalah.", "hr"],
    ["PNS-2026-003", "Internal Audit", "SK-SMS", "FK-03", "1st Occurrence", "SP1", "SP2", "[Contoh] ID card diskon karyawan dipakai untuk transaksi pelanggan umum sebanyak 6 bill.", "done"],
  ];
  for (const [code, fn, unit, mcode, occ, std, prop, desc, status] of pn) {
    const rule = ((await q.query(`select appeal, authority from matrix_rules where code = $1`, [mcode])) as { appeal: string; authority: string }[])[0];
    await q.query(
      `insert into punishments (code, submitter_fn, submitted_by, unit_id, matrix_code, occurrence, matrix_std, proposed, description, status,
         final, legal_by, legal_at, hr_by, hr_at, appeal, authority, is_demo)
       values ($1,$2,'Data contoh',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true)`,
      [code, fn, unitIds.get(unit), mcode, occ, std, prop, desc, status,
        status === "legal" ? null : std, status === "legal" ? null : "Jala Yuan", status === "legal" ? null : new Date(Date.now() - 2 * 86_400_000),
        status === "done" ? "HR Business Partner" : null, status === "done" ? new Date(Date.now() - 86_400_000) : null, rule?.appeal ?? null, rule?.authority ?? null],
    );
  }
}
