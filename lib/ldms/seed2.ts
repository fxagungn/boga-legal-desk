// Master outlets (LIST OUTLET 2026) and demo data v4. Demo rows sit on real Boga Group outlets; numbers, dates,
// counterparties and case facts are illustrative and marked "[Contoh]" / is_demo. Admin Console → Sistem removes them all.

type Q = { query: (text: string, params?: unknown[]) => Promise<unknown[]> };
type Scope = "outlet" | "central_kitchen" | "korporat";

/** Outlets used by the demo data — real units from LIST OUTLET 2026: [outlet code, has alcohol permit, has lift permit]. */
export const DEMO_PICK: [string, boolean, boolean][] = [
  ["PLPS", false, false], ["PLGI", false, false], ["PLKK", false, false], ["PLPWB", false, false],
  ["KKGI", false, false], ["KKP3", false, false], ["KKCP", false, false],
  ["SKSC", true, false], ["SKP3", true, false], ["SKSM", true, false], ["SKCW", true, false],
  ["YLKK", false, false], ["YLKG", false, false], ["YLGB", false, false],
  ["PDPS", true, false], ["PDCP", true, true], ["EBMC", false, false], ["HTP5", false, false],
  ["CHK", false, false], ["HO", false, false],
];

/** LIST OUTLET 2026 → brands + units (real master data, not demo). Runs once. */
export async function seedOutlets2026(q: Q) {
  const lock = (await q.query(`insert into app_settings (key, value) values ('outlets_2026', 'true'::jsonb) on conflict (key) do nothing returning key`)) as unknown[];
  if (lock.length === 0) return;
  const { OUTLETS_2026 } = await import("./outlets-2026");
  for (const b of new Set(OUTLETS_2026.map((o) => o[1]).filter((x): x is string => !!x))) {
    await q.query(`insert into brands (name) values ($1) on conflict (name) do nothing`, [b]);
  }
  const brandId = new Map(((await q.query(`select id, name from brands`)) as { id: number; name: string }[]).map((b) => [b.name, b.id]));
  for (const [code, brand, name, mall, scope] of OUTLETS_2026) {
    await q.query(
      `insert into units (code, name, brand_id, scope, mall, status, is_demo) values ($1,$2,$3,$4,$5,'aktif',false)
       on conflict (code) do update set name = excluded.name, brand_id = excluded.brand_id, scope = excluded.scope, mall = coalesce(units.mall, excluded.mall), is_demo = false`,
      [code, name, brand ? brandId.get(brand) ?? null : null, scope, mall],
    );
  }
  await q.query(`insert into units (code, name, scope, city, status, is_demo) values ('HO','Head Office Boga Group','korporat','Tangerang','aktif',false)
    on conflict (code) do update set is_demo = false`);
}

const OUTLET_BASE = ["NIB", "RKL", "HLL", "SLS", "HPJ", "HPM", "LAB", "ULP", "SKP", "NPD", "PHR", "GST", "LIS"];

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Remove every demo row (permits, units, agreements, cases …). Real data is never touched. */
export async function deleteDemo(q: Q) {
  for (const [entity, table] of [["permit", "permits"], ["agreement", "agreements"], ["inspection", "inspections"], ["library", "library"], ["case", "cases"], ["sigap", "sigap_results"]]) {
    await q.query(`delete from notes where entity = $1 and entity_id in (select id from ${table} where is_demo)`, [entity]);
    await q.query(`delete from files where entity = $1 and entity_id in (select id from ${table} where is_demo)`, [entity]);
    await q.query(`delete from reminders where entity = $1 and entity_id in (select id from ${table} where is_demo)`, [entity]);
    await q.query(`delete from audit_log where entity = $1 and entity_id in (select id::text from ${table} where is_demo)`, [entity]);
  }
  await q.query(`delete from punishments where is_demo`);
  await q.query(`delete from kb_cases where is_demo or case_id in (select id from cases where is_demo) or sigap_id in (select id from sigap_results where is_demo)`);
  await q.query(`delete from cases where is_demo`);
  await q.query(`delete from sigap_results where is_demo`);
  await q.query(`delete from agreements where is_demo and kind = 'ULA'`);
  await q.query(`delete from agreements where is_demo`);
  await q.query(`delete from permits where is_demo`);
  await q.query(`delete from inspections where is_demo`);
  await q.query(`delete from library where is_demo`);
  await q.query(`delete from kb_cases where is_demo`);
  await q.query(`delete from units u where u.is_demo and not exists (select 1 from permits p where p.unit_id = u.id)
     and not exists (select 1 from agreements a where a.unit_id = u.id) and not exists (select 1 from inspections i where i.unit_id = u.id)
     and not exists (select 1 from cases c where c.unit_id = u.id) and not exists (select 1 from sigap_results s where s.unit_id = u.id)`);
}

export async function seedDemoV2(q: Q) {
  const lock = (await q.query(
    `insert into app_settings (key, value) values ('ldms_demo_v4', 'true'::jsonb) on conflict (key) do nothing returning key`,
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

  type U = { id: number; code: string; name: string; brand: string | null; scope: Scope; mall: string | null; city: string | null };
  const allUnits = (await q.query(`select u.id, u.code, u.name, b.name as brand, u.scope, u.mall, u.city from units u left join brands b on b.id = u.brand_id`)) as U[];
  const picked = DEMO_PICK.map(([c, alcohol, lift]) => ({ u: allUnits.find((x) => x.code === c), alcohol, lift })).filter((x): x is { u: U; alcohol: boolean; lift: boolean } => !!x.u);
  const unitIds = new Map<string, number>();
  for (const { u: unit, alcohol, lift } of picked) {
    const { code, brand, scope } = unit;
    const u = [{ id: unit.id }];
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
    ["PLGI", "RKL", "Somasi I — pengelola mal: signage tanpa izin reklame berlaku, diminta diturunkan dalam 7 hari."],
    ["SKSC", "SLS", "Teguran tertulis Dinas Kesehatan: Sertifikat Laik Sehat belum diperpanjang saat sidak."],
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
    ["PLGI", "RKL", "[Contoh] Sudah koordinasi dengan building management, materi signage baru diajukan ke Dinas PM & PTSP."],
    ["SKSC", "SLS", "[Contoh] Peserta pelatihan hygiene sudah didaftarkan untuk batch terdekat."],
    ["CHK", "BTF", "[Contoh] Teknisi PJK3 dijadwalkan riksa uji minggu depan."],
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

  /* ---------- agreements (MLA per principal brand, ULA per outlet of that brand, PKS) ---------- */
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
  for (const { u: { code, name, brand, scope, mall, city } } of picked) {
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
  /* ---------- government inspections (contoh) ---------- */
  const ins: [string, number, string, string, string, string, string, string, string, number | null][] = [
    ["INS-2024-003", -1000, "Disnakertrans", "Pemeriksaan norma K3 — rutin tahunan", "CHK", "Temuan minor", "Riksa uji bejana tekan chiller kedaluwarsa 1 bulan; dokumen riksa uji instalasi listrik 170 KVA tidak tersedia saat pemeriksaan.", "Pengajuan riksa uji ulang dalam 14 hari, dokumen K3 dikompilasi dalam satu binder di lokasi.", "Nota pemeriksaan, tanpa denda. Diminta lapor realisasi dalam 30 hari.", null],
    ["INS-2024-011", -865, "Dinas Kesehatan", "Inspeksi sanitasi & laik sehat", "KKP3", "Temuan mayor", "Sertifikat pelatihan hygiene penjamah makanan habis untuk 3 dari 8 crew; log suhu chiller tidak terisi 4 hari.", "Pendaftaran pelatihan hygiene batch terdekat, penanggung jawab log harian, audit internal 2 minggu sekali.", "Teguran tertulis; laik sehat ditahan sampai bukti pelatihan diserahkan.", null],
    ["INS-2025-002", -657, "Satpol PP & Bapenda", "Penertiban reklame", "PLKK", "Sanksi administratif", "Izin reklame lewat masa berlaku 21 hari; signage masih terpasang.", "Pembayaran pajak reklame terutang + denda, pengajuan izin baru, signage diturunkan sementara 5 hari.", "Denda administratif dan signage diturunkan 5 hari.", 4_200_000],
    ["INS-2025-018", -426, "Disnakertrans — Wasnaker", "Pemeriksaan norma kerja (WLKP & Peraturan Perusahaan)", "HO", "Temuan minor", "WLKP terlapor namun data jumlah karyawan tidak mutakhir; Peraturan Perusahaan tersisa 2 bulan tanpa proses pengesahan ulang.", "Pembaruan WLKP tiap kuartal, pengajuan pengesahan PP 60 hari sebelum berakhir.", "Nota pemeriksaan; bukti pengajuan PP diminta dalam 45 hari.", null],
    ["INS-2026-004", -206, "BPJPH & LPH", "Surveilan sertifikasi halal", "PLGI", "Sesuai", "Dokumen SJPH lengkap; 1 bahan baku baru belum masuk daftar bahan disetujui.", "Penambahan bahan ke daftar melalui SIHALAL sebelum digunakan.", "Tidak ada sanksi; catatan surveilan ditutup.", null],
    ["INS-2026-009", -130, "Disperindag", "Pengawasan peredaran minuman beralkohol", "SKCW", "Temuan minor", "SIUP-MB berlaku, namun pencatatan stok dan penjualan MB tidak sesuai format pelaporan triwulan.", "Format pelaporan resmi, pelatihan kasir, rekonsiliasi stok MB bulanan oleh Finance.", "Pembinaan tertulis; wajib lapor triwulan tepat format 1 tahun.", null],
  ];
  for (const [code, d, agency, kind, unit, result, findings, follow, cons, fine] of ins) {
    await q.query(
      `insert into inspections (code, insp_date, agency, kind, unit_id, result, findings, follow_up, consequence, fine, pic_id, closed_at, next_expected, is_demo, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'Data contoh')`,
      [code, date(d), agency, kind, unitIds.get(unit) ?? null, result, findings, follow, cons, fine, unit === "HO" || unit === "CHK" ? salma : dola, date(d + 30), date(d + 365)],
    );
  }

  /* ---------- repository: legal opinions & memos (contoh) ---------- */
  const lib: [string, string, number, string, string, string, string][] = [
    ["LIB-LO-002", "Legal Opinion", -539, "Tanggung jawab perizinan pada outlet di dalam mal", "Diminta Ops Director", "Izin reklame dan laik sehat tetap kewajiban penyewa meski mal memiliki izin induk.", "Cantumkan pembagian kewajiban perizinan secara eksplisit di perjanjian dengan pengelola mal untuk menghindari sengketa biaya."],
    ["LIB-LO-005", "Legal Opinion", -397, "Konsekuensi operasional saat izin laik sehat kedaluwarsa", "Diminta Legal Manager", "Operasional tanpa sertifikat laik sehat berlaku memberi dasar penghentian sementara oleh Dinas Kesehatan.", "Ambang pengajuan renewal H-60 karena jadwal pelatihan hygiene Dinkes sering menjadi bottleneck."],
    ["LIB-LO-009", "Legal Opinion", -230, "Pelaporan pidana atas penggelapan oleh pihak ketiga", "Diminta Finance Controller", "Penggelapan setoran oleh pihak ketiga memenuhi unsur Pasal 372 KUHP bila penguasaan barang sah sejak awal; bukti utama: tanda terima setoran dan rekonsiliasi bank.", "Amankan bukti dalam 3x24 jam, buat Berita Acara internal sebelum laporan polisi, dan tunjuk satu PIC Legal sebagai penghubung penyidik."],
    ["LIB-LO-012", "Legal Opinion", -142, "Penanganan komplain konsumen yang viral di media sosial", "Diminta Corporate Communication", "Respons publik tidak boleh memuat pengakuan tanggung jawab sebelum investigasi QA selesai; kompensasi diberikan sebagai itikad baik.", "Kesepakatan damai memuat klausul kerahasiaan dan non-disparagement; libatkan Legal sebelum unggahan klarifikasi."],
    ["LIB-MM-003", "Memo hukum", -96, "Batas PHK karena pelanggaran dan dokumentasi pembinaan", "Untuk HR Business Partner", "PHK atas pelanggaran mendesak tetap memerlukan dokumentasi pembinaan dan kesempatan pembelaan diri.", "Setiap SP wajib ada tanda terima atau Berita Acara penolakan; arsip di SIGAP."],
    ["LIB-RES-003", "Resume", -117, "Pola temuan pemeriksaan Disnakertrans 3 tahun terakhir", "Untuk rapat Ops & Legal", "Temuan berulang pada riksa uji peralatan Central Kitchen dan kemutakhiran data WLKP.", "Jadwalkan riksa uji serentak per semester dan perbarui WLKP setiap kuartal."],
  ];
  for (const [code, kind, d, title, parties, core, points] of lib) {
    await q.query(
      `insert into library (code, kind, doc_date, title, parties, core, key_points, is_demo, updated_by) values ($1,$2,$3,$4,$5,$6,$7,true,'Data contoh')`,
      [code, kind, date(d), title, parties, core, points],
    );
  }

  /* ---------- cases (contoh; functions only, no employee names) ---------- */
  type Step = [number, string, string, string];
  type Doc = [string, string, number];
  type C = {
    code: string; cat: string; title: string; unit: string; inc: number; rep: number; reporter: string; cp: string; forum: string; risk: string; exposure: number | null;
    chrono: string; rcc: string; rc: string; status: string; steps: Step[]; docs: Doc[];
    close?: { decision: string; outcome: string; settlement: number | null; lesson: string; preventive: string };
  };
  const cases: C[] = [
    {
      code: "CASE-2025-004", cat: "Konsumen & regulator", title: "Keluhan dugaan keracunan makanan yang viral di media sosial", unit: "PLGI", inc: -410, rep: -409,
      reporter: "Customer Service", cp: "[Contoh] Pelanggan pengadu", forum: "Mediasi", risk: "Tinggi", exposure: 50_000_000,
      chrono: "Pelanggan mengunggah keluhan sakit perut setelah makan di outlet; unggahan dibagikan ulang ±4.000 kali dalam 24 jam. Pelanggan meminta ganti rugi dan mengancam melapor ke Dinas Kesehatan.",
      rcc: "Keamanan pangan / kualitas produk", rc: "Holding time saus melewati batas SOP 4 jam saat jam ramai; tidak ada label waktu pada wadah.", status: "selesai",
      steps: [[-409, "Laporan diterima", "Customer Service", "Keluhan dicatat, pelanggan dihubungi dalam 2 jam"], [-408, "Investigasi & pengumpulan bukti", "QA Manager & Legal Officer", "Audit dapur, log suhu dan holding time ditarik, sampel diuji di laboratorium terakreditasi"],
        [-405, "Berita Acara", "Legal Officer", "BA klarifikasi dengan pelanggan dan BA hasil audit QA ditandatangani"], [-400, "Negosiasi / mediasi", "Legal Manager", "Pertemuan dengan pelanggan; penggantian biaya pengobatan sebagai itikad baik"],
        [-396, "Keputusan", "Legal Manager & Corporate Communication", "Kesepakatan damai disetujui; klarifikasi publik bersama"]],
      docs: [["Berita Acara", "BA klarifikasi pelanggan", -405], ["Bukti", "Hasil uji laboratorium sampel", -403], ["Kesepakatan", "Surat kesepakatan damai", -396]],
      close: { decision: "Penggantian biaya pengobatan dan voucher; kesepakatan damai dengan klausul kerahasiaan dan non-disparagement.", outcome: "Damai / settlement", settlement: 7_500_000,
        lesson: "Respons 1x24 jam dengan alur QA → Legal → Corcom mencegah eskalasi ke regulator. Holding time wajib dilabel.", preventive: "Label waktu pada wadah saus, audit holding time mingguan oleh QA." },
    },
    {
      code: "CASE-2025-011", cat: "Ketenagakerjaan", title: "Perselisihan PHK karyawan — mediasi Disnaker", unit: "KKP3", inc: -330, rep: -322,
      reporter: "HR Business Partner", cp: "[Contoh] Mantan karyawan", forum: "PHI / Disnaker", risk: "Sedang", exposure: 64_000_000,
      chrono: "Karyawan di-PHK setelah SP3 karena ketidakhadiran berulang. Karyawan menggugat ke Disnaker dengan dalil SP1 dan SP2 tidak pernah diterima.",
      rcc: "SOP tidak dijalankan", rc: "SP1 dan SP2 tidak memiliki tanda terima atau Berita Acara penolakan.", status: "selesai",
      steps: [[-322, "Laporan diterima", "HR Business Partner", "Panggilan mediasi Disnaker diterima"], [-318, "Investigasi & pengumpulan bukti", "Legal Officer", "Arsip SP, absensi, dan payroll dikumpulkan"],
        [-300, "Negosiasi / mediasi", "Legal Manager & HR Business Partner", "Dua kali sidang mediasi di Disnaker"], [-286, "Keputusan", "Legal Manager", "Perjanjian Bersama disepakati dan didaftarkan ke PHI"]],
      docs: [["Somasi / surat", "Surat panggilan mediasi Disnaker", -322], ["Kesepakatan", "Perjanjian Bersama (didaftarkan PHI)", -286]],
      close: { decision: "Perjanjian Bersama: kompensasi sesuai PP 35/2021 tanpa pengakuan PHK cacat prosedur.", outcome: "Damai / settlement", settlement: 38_500_000,
        lesson: "Dokumentasi pembinaan menentukan posisi tawar. SP tanpa tanda terima melemahkan posisi perusahaan di mediasi.", preventive: "Setiap SP dicatat di SIGAP dengan tanda terima / BA penolakan." },
    },
    {
      code: "CASE-2025-018", cat: "Sengketa komersial", title: "Wanprestasi vendor POS — maintenance terlambat", unit: "HO", inc: -250, rep: -246,
      reporter: "IT Manager", cp: "[Contoh] Vendor sistem POS", forum: "Somasi / negosiasi", risk: "Sedang", exposure: 120_000_000,
      chrono: "Gangguan POS di 9 outlet tidak ditangani dalam SLA 4 jam selama 3 minggu; transaksi manual menimbulkan selisih kas.",
      rcc: "Kontrak / dokumen lemah", rc: "PKS tidak memuat service credit; satu-satunya remedi adalah terminasi.", status: "selesai",
      steps: [[-246, "Laporan diterima", "IT Manager", "Log tiket gangguan diserahkan ke Legal"], [-240, "Berita Acara", "Legal Officer", "BA keterlambatan SLA ditandatangani IT dan vendor"],
        [-235, "Eskalasi", "Legal Manager", "Somasi I dikirim ke vendor"], [-220, "Negosiasi / mediasi", "Legal Manager & Procurement", "Negosiasi kompensasi dan amandemen PKS"], [-210, "Keputusan", "Head of Legal", "Amandemen PKS disetujui"]],
      docs: [["Berita Acara", "BA keterlambatan SLA", -240], ["Somasi / surat", "Somasi I kepada vendor POS", -235], ["Kesepakatan", "Amandemen PKS dengan service credit", -210]],
      close: { decision: "Kompensasi berupa potongan biaya maintenance 3 bulan dan amandemen PKS dengan service credit 5% per pelanggaran SLA.", outcome: "Damai / settlement", settlement: 45_000_000,
        lesson: "PKS jasa kritikal wajib memuat service credit, bukan hanya hak terminasi.", preventive: "Template PKS jasa diperbarui dengan klausul service credit." },
    },
    {
      code: "CASE-2026-002", cat: "Pidana / laporan polisi", title: "Penggelapan setoran tunai oleh kurir pihak ketiga", unit: "SKSC", inc: -120, rep: -115,
      reporter: "Finance Controller", cp: "[Contoh] Kurir jasa pengantaran setoran", forum: "Kepolisian", risk: "Tinggi", exposure: 48_600_000,
      chrono: "Tiga setoran tunai tidak masuk ke rekening perusahaan; kurir pihak ketiga tidak dapat dihubungi setelah tanggal setoran terakhir.",
      rcc: "Kontrol internal lemah", rc: "Setoran tunai diserahkan tanpa dual control dan tanpa verifikasi bank harian.", status: "proses",
      steps: [[-115, "Laporan diterima", "Finance Controller", "Selisih rekonsiliasi bank dilaporkan ke Legal"], [-113, "Investigasi & pengumpulan bukti", "Legal Officer & Internal Audit", "Tanda terima setoran, CCTV, dan mutasi rekening dikumpulkan"],
        [-110, "Berita Acara", "Legal Officer", "BA pemeriksaan internal dengan saksi Outlet Manager"], [-108, "Proses hukum", "Legal Manager", "Laporan polisi dibuat; penyidik meminta keterangan saksi"]],
      docs: [["Berita Acara", "BA pemeriksaan internal", -110], ["Laporan polisi", "Tanda bukti lapor", -108], ["Bukti", "Rekonsiliasi bank & tanda terima setoran", -112]],
    },
    {
      code: "CASE-2026-005", cat: "Sengketa komersial", title: "Sengketa kenaikan service charge dengan pengelola mal", unit: "YLKK", inc: -75, rep: -70,
      reporter: "Business Development", cp: "[Contoh] Pengelola mal", forum: "Somasi / negosiasi", risk: "Sedang", exposure: 186_000_000,
      chrono: "Pengelola mal menaikkan service charge 18% dan menagih denda keterlambatan atas selisih yang ditolak outlet.",
      rcc: "Kontrak / dokumen lemah", rc: "Perjanjian sewa tidak memuat batas kenaikan service charge.", status: "proses",
      steps: [[-70, "Laporan diterima", "Business Development", "Tagihan dan surat pengelola diteruskan ke Legal"], [-64, "Investigasi & pengumpulan bukti", "Legal Officer", "Perbandingan kenaikan service charge di mal sejenis"],
        [-50, "Negosiasi / mediasi", "Legal Manager & Business Development", "Pertemuan pertama dengan pengelola mal"]],
      docs: [["Somasi / surat", "Surat tagihan & denda pengelola mal", -70]],
    },
    {
      code: "CASE-2026-009", cat: "Ketenagakerjaan", title: "Kecelakaan kerja crew dapur — luka bakar", unit: "CHK", inc: -21, rep: -21,
      reporter: "HSE Officer", cp: "—", forum: "Regulator / instansi", risk: "Sedang", exposure: null,
      chrono: "Crew dapur mengalami luka bakar tingkat II saat memindahkan panci kaldu. Dilaporkan sebagai kecelakaan kerja ke BPJS Ketenagakerjaan.",
      rcc: "SOP tidak dijalankan", rc: "APD (sarung tangan tahan panas) tidak dipakai; troli angkut sedang rusak.", status: "investigasi",
      steps: [[-21, "Laporan diterima", "HSE Officer", "Pertolongan pertama dan rujukan ke rumah sakit"], [-20, "Investigasi & pengumpulan bukti", "HSE Officer & Legal Officer", "Investigasi kecelakaan dan laporan tahap I ke BPJS Ketenagakerjaan"]],
      docs: [["Berita Acara", "BA kecelakaan kerja", -20]],
    },
  ];
  const caseIds = new Map<string, number>();
  for (const c of cases) {
    const r = (await q.query(
      `insert into cases (code, category, title, unit_id, incident_date, reported_date, reporter, counterparty, forum, risk, exposure, chronology, root_cause_cat, root_cause,
         pic_id, status, decision, outcome, settlement, closed_at, lesson, preventive, is_demo, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,true,'Data contoh') returning id`,
      [c.code, c.cat, c.title, unitIds.get(c.unit) ?? allUnits.find((u) => u.code === c.unit)?.id ?? null, date(c.inc), date(c.rep), c.reporter, c.cp, c.forum, c.risk, c.exposure,
        c.chrono, c.rcc, c.rc, c.cat === "Ketenagakerjaan" ? jala ?? salma : c.cat === "Sengketa komersial" ? virgy ?? salma : dola ?? salma, c.status,
        c.close?.decision ?? null, c.close?.outcome ?? null, c.close?.settlement ?? null, c.close ? date(c.steps[c.steps.length - 1][0]) : null, c.close?.lesson ?? null, c.close?.preventive ?? null],
    )) as { id: number }[];
    const id = r[0].id;
    caseIds.set(c.code, id);
    for (const [d, stage, handler, action] of c.steps) {
      await q.query(`insert into case_steps (case_id, step_date, stage, handler, action, by_name) values ($1,$2,$3,$4,$5,'Data contoh')`, [id, date(d), stage, handler, action]);
    }
    if (c.close) await q.query(`insert into case_steps (case_id, step_date, stage, handler, action, by_name) values ($1,$2,'Penutupan','Legal Manager',$3,'Data contoh')`, [id, date(c.steps[c.steps.length - 1][0]), `Ditutup: ${c.close.outcome}`]);
    for (const [kind, label, d] of c.docs) {
      await q.query(`insert into case_docs (case_id, kind, label, doc_date, by_name) values ($1,$2,$3,$4,'Data contoh')`, [id, kind, `[Contoh] ${label}`, date(d)]);
    }
  }
  // Closed cases → Knowledge Base (same mapping as publishCaseToKb, done in SQL because the app's query() is not ready during seeding).
  await q.query(
    `insert into kb_cases (code, case_date, title, unit_label, brand, category, location, chronology, investigation, decider, sanction, reasoning, root_cause, outcome, lesson, case_id, source, is_demo)
     select 'KB-' || c.code, c.closed_at, c.title, u.name, b.name, c.category, c.forum, c.chronology,
       (select string_agg(s.stage || ' — ' || s.handler, ' → ' order by s.step_date, s.id) from case_steps s where s.case_id = c.id),
       (select string_agg(s.handler, ', ') from case_steps s where s.case_id = c.id and s.stage = 'Keputusan'),
       c.decision, c.preventive, concat_ws(' — ', c.root_cause_cat, c.root_cause), c.outcome, c.lesson, c.id, 'case', true
     from cases c left join units u on u.id = c.unit_id left join brands b on b.id = u.brand_id
     where c.is_demo and c.status = 'selesai' on conflict (code) do nothing`,
  );
  await q.query(`update cases set kb_code = 'KB-' || code where is_demo and status = 'selesai'`);

  /* ---------- SIGAP results (contoh) ---------- */
  const sg: [string, number, string, string, string, string, string, string][] = [
    ["SGP-2026-001", -160, "PDPS", "Kepatuhan SOP", "Merokok di area belakang dapur", "Surat Teguran", "Smoking area tidak tersedia di jalur belakang outlet", "Koordinasi dengan pengelola mal untuk smoking area karyawan; sosialisasi ulang SOP."],
    ["SGP-2026-004", -95, "PLKK", "Fraud & kriminal", "Diskon karyawan dipakai untuk transaksi pelanggan umum", "SP1", "Kartu diskon karyawan tidak divalidasi di POS", "Validasi NIK di POS untuk setiap diskon karyawan; audit anomali diskon bulanan."],
    ["SGP-2026-007", -40, "KKGI", "Keamanan pangan", "Log suhu chiller tidak diisi 3 hari", "Surat Teguran", "Penanggung jawab log tidak ditetapkan per shift", "Tetapkan PIC log suhu per shift dan cek oleh MOD saat closing."],
  ];
  for (const [code, d, unit, cat, violation, decision, rc, lesson] of sg) {
    const r = (await q.query(
      `insert into sigap_results (code, ref, result_date, unit_id, category, violation, decision, root_cause, lesson, is_demo, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'Data contoh') returning id`,
      [code, `[Contoh] ${code.replace("SGP", "SIGAP")}`, date(d), allUnits.find((u) => u.code === unit)?.id ?? null, cat, violation, decision, rc, lesson],
    )) as { id: number }[];
    await q.query(
      `insert into kb_cases (code, case_date, title, unit_label, brand, category, summary, sanction, root_cause, lesson, outcome, sigap_id, source, is_demo)
       select 'KB-' || s.code, s.result_date, s.violation, u.name, b.name, 'SIGAP · ' || s.category, s.violation, s.decision, s.root_cause, s.lesson, 'Sanksi internal', s.id, 'sigap', true
       from sigap_results s left join units u on u.id = s.unit_id left join brands b on b.id = u.brand_id where s.id = $1 on conflict (code) do nothing`,
      [r[0].id],
    );
    await q.query(`update sigap_results set kb_code = 'KB-' || code where id = $1`, [r[0].id]);
  }
}
