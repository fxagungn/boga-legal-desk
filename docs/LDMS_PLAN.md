# LDMS Boga Group — Rencana Build (v0.1, draft untuk dikonfirmasi)

> Sumber: `LDMS_Blueprint.md`, `LIST_PERIZINAN_JATUH_TEMPO.xlsx`, sheet karyawan Boga (EMPLOYEE, LIST OUTLET), dan kode Boga Legal Desk yang sudah ada di repo ini.
> Status: **keputusan terkunci (§10)** · Fase 0 & 1 selesai di branch `claude/ldms-planning-8b9qv0` (§11).

---

## 1. Keputusan arsitektur utama

Blueprint ditulis untuk Google Apps Script + Sheets. Kita **pindah ke stack web modern** agar cepat, aman, dan AI-nya bisa agentic:

| Lapisan | Pilihan | Alasan |
|---|---|---|
| App | **Next.js 16 (App Router) di Vercel** — repo ini | Sudah ada: auth NIK, design token Boga, layer DB, AI SDK |
| Database | **Postgres (Neon via Vercel)** — atau Supabase, layer DB sudah mendukung keduanya | Relasional, transaksi, full-text search, `pgvector` untuk AI |
| File | **Vercel Blob** (scan izin, PDF kontrak, bukti sanksi) | Satu dashboard Vercel; private URL bertanda tangan |
| AI | **Claude via Vercel AI Gateway** (AI SDK, tool calling) | Tanpa API key di kode; bisa fallback model |
| Jadwal | **Vercel Cron** → `/api/cron/*` | Ganti time-driven trigger Apps Script |
| Email | **Hybrid**: kirim lewat Microsoft Graph dari shared mailbox Legal (M365); penerima boleh Outlook (manajerial) maupun Google Workspace | Penerima tidak harus punya M365; fallback Resend |
| File kerja | Google Shared Drive (GWS dipakai untuk sharing) — link Drive per dokumen; upload kecil disimpan di DB | Fase 3: tombol "Simpan ke Drive" via service account |
| Sync karyawan | Google Sheets API (service account, read-only) | Auto-nonaktifkan akun yang resign |

**Strategi repo:** *evolve, bukan rewrite.* Pertahankan auth, `lib/db.ts`, `lib/password.ts`, token warna, komponen UI. Fitur email-intake yang lama dijadikan modul **"Review Kontrak / Dokumen Masuk"** di bawah pilar Library (atau dimatikan — Q1).

---

## 2. Akses & login (sesuai permintaan)

- **Hanya tim Legal** yang bisa login. Sumber kebenaran: sheet karyawan (tab `EMPLOYEE`). Masuk hitungan bila **Position Title** memuat "Legal" atau "CPLO", **atau** `Dept/Outlet`/`Div/Brand` = Legal (perlu, karena staf permit berjabatan "Permit & Insurance Staff"). Departemen gabungan "Human Capital & Legal" tidak ikut agar tim HC tidak mendapat akses. Pola bisa diubah lewat env tanpa ubah kode.
- **Username = NIK (`Employee Id`)**, **password awal = tanggal lahir `DDMMYYYY`** dari kolom `Birthdate`.
- **Login pertama wajib ganti password** (min. 8 karakter, huruf + angka, bukan tanggal lahir, bukan NIK). Kode untuk ini sudah ada.
- Tanggal lahir **tidak pernah disimpan mentah** — langsung di-hash scrypt; sheet hanya dibaca saat sync.
- Lockout 5x gagal / 15 menit (sudah ada); sesi 12 jam idle; tombol Keluar.
- **Sync harian 06:00 WIB**: karyawan Legal baru → akun dibuat; kolom `Resign` terisi → akun dinonaktifkan otomatis & sesi dicabut.
- Admin (Supervisor ke atas) bisa: reset password ke tanggal lahir, menonaktifkan akun, mengubah role.

### Role (usulan, menyesuaikan tim nyata — Q2)
| Role | Siapa (usulan) | Hak |
|---|---|---|
| `cpo` (**CPLO**) | Ernica Silaban | Lihat semua, menerima eskalasi H-0/overdue, dashboard |
| `agm` (Head) | Belinda Putri Febrianti | Lihat & edit semua, approval, menerima eskalasi H-7 |
| `manager` | Ronald, Arsy | Lihat & edit semua, approval |
| `supervisor` | Jala (Permit), Virgy (Corporate) | Full edit, **approval sanksi tahap Legal**, CC tahap-2 reminder |
| `staff` | Tika, Dola, Salma | Edit dokumen yang PIC-nya dia; lihat semua (read-only) |

---

## 3. Navigasi (disederhanakan dari 12 → 8 menu)

Prinsip UX: **satu layar = satu pertanyaan**. Kurangi menu, perbanyak drawer & aksi kontekstual.

```
┌ Beranda          – "Hari ini" untuk saya: tugas, jatuh tempo, approval menunggu + KPI singkat
├ Tanya LDMS  ✦    – Chat AI (juga tersedia sebagai tombol ✦ / Ctrl+K di semua halaman)
├ Perizinan        – Registry + drawer detail (status renewal, somasi, catatan, file, riwayat reminder)
├ Perjanjian       – Tab MLA · ULA · PKS · PSM
├ Sanksi           – Tab: Ajukan · Antrean approval · Terapkan Matrix · Matrix Disiplin
├ Pemeriksaan      – Riwayat inspeksi instansi + "Siapkan pemeriksaan" (AI)
├ Pustaka          – Library (PKS/PSM/License/LO/Resume) + Knowledge Base kasus
└ Pengaturan       – Tim & akses, jenis izin, outlet/brand, aturan reminder, audit trail, log AI
```

- **Search global (Ctrl+K)** di header: cari ID, nomor izin, outlet, pihak, isi catatan, somasi — hasil diurut paling mendesak. Bila query berbentuk pertanyaan ("izin apa yang overdue?"), langsung dioper ke Tanya LDMS.
- "Reminder Engine" dari blueprint dilebur: tangga eskalasi & outbox jadi tab di **Pengaturan → Reminder**, sedangkan riwayat per dokumen ada di drawer.

### Gaya visual
Clean white, aksen merah Boga `#C0272D` (sudah di token), latar `#FAFAF9`, kartu putih border tipis radius 12, font Plus Jakarta Sans + mono untuk ID/kode/chip hari. Chip status konsisten di semua modul: merah solid (overdue/hari ini) · merah muda (≤7) · amber (≤30) · kuning (≤60) · abu-hijau (aman). Mobile-friendly (tim Legal sering di lapangan).

---

## 4. Data model (Postgres)

Mengikuti blueprint §4, dinormalisasi:

```
members(id, nik, name, title, role, email, phone, active, password_hash, must_change_pw, last_login_at)
brands(id, name, has_principal, principal_name, currency)
units(id, code, name, brand_id, scope[outlet|central_kitchen|korporat], mall, city, area, status)   ← dari LIST OUTLET
permit_types(id, code, name, kind[new|renewal], scope, lead_days, validity_years, agency, est_cost, blocker_note)  ← 26/29 jenis
permits(id 'D0001', unit_id, permit_type_id, number, issue_date, expiry_date, renewal_status, renewal_eta,
        pic_id, cost_actual, requires_ack, somasi_text, somasi_at, somasi_by, file_ids[])
agreements(id 'MLA-001'…, kind, parent_id, brand_id, unit_id, counterparty, principal, territory, start, end,
           notice_days, currency, value, unit_fee, royalty_pct, fx_ref, scheme, termination_clause, pic_id)
notes(id, entity, entity_id, text, by, at)                ← satu tabel untuk semua catatan
files(id, entity, entity_id, blob_url, name, mime, extracted_text, uploaded_by, at)
reminders(id, entity, entity_id, stage, stage_key UNIQUE, to, cc, sent_at, channel)
acks(id, entity, entity_id, by, at, via)
matrix_rules(code, category, sub_category, s_1st, s_repeat, s_severe, appeal, authority, note, version)  ← 72 kode
punishments(id 'PNS-2026-001', submitter_fn, unit_id, code, occurrence, matrix_std, proposed, description,
            ai_check jsonb, final, deviation_reason, legal_by/at, hr_by/at, status, rejected_reason)   ← TANPA nama karyawan
kb_cases(id 'YRS-2026-001', date, title, unit, category, code, steps, functions, decision, summary, chronology, reasoning)
inspections(id 'INS-2026-001', date, agency, kind, unit_id, result, findings, follow_up, consequence, fine, pic_id, closed_at, next_expected)
library(id 'LIB-LO-001', kind, date, title, parties, core, key_points, outcome, file_ids[])
tasks(id, entity, entity_id, title, due, assignee_id, status, source[auto|ai|manual])
ai_runs(id, module, by, at, input, output, confidence, refs[], decided_value, decided_by)
audit(id, ts, member_id, action, entity, entity_id, detail)
embeddings(entity, entity_id, chunk, vector)              ← pgvector, untuk RAG Pustaka/KB/kontrak
```

Semua tanggal `date`/`timestamptz`, zona Asia/Jakarta. Seed: 26 jenis izin dari Excel (+3 jenis tambahan di blueprint: NIB, Sertifikat Halal, Izin Alkohol), 72 kode matrix, brand & outlet dari LIST OUTLET.

---

## 5. Workflow & automation

### 5.1 Perizinan — siklus renewal
```
Aman ──(H-lead)──▶ Perlu diproses ──▶ On progress ──▶ Submitted ke instansi ──▶ Terbit
                     │  auto: buat tugas + checklist dokumen per jenis izin      │ isi tgl berlaku baru + upload
                     │  auto: reminder ke PIC Legal                              └▶ siklus baru dibuat otomatis
                     └─(tidak bergerak X hari)─▶ eskalasi ke Supervisor
```
- **Tangga reminder** dari `lead_days` (blueprint §5.7): H-lead → H-lead/2 → H-7 → H-1 → H-0 → OVERDUE harian. CC naik per tahap (Supervisor → Head → Director). Anti-duplikat via `stage_key` UNIQUE. Kalau cron terlewat, kirim tahap tertinggi yang tercapai saja.
- **Legal-only**: tidak ada email ke outlet/Brand Leader.
- **Somasi**: tandai → wajib acknowledge → reminder harian sampai di-ack (via tombol di email ber-token HMAC atau di app).
- **Terbit** → otomatis buat record izin periode berikutnya (expiry = terbit + masa berlaku), riwayat tetap tersimpan.
- **Digest**: ringkasan pagi per PIC (harian, hanya bila ada isi) + weekly digest Senin ke Supervisor/Head.

### 5.2 Perjanjian
- Reminder pada **notice_days** + H-60/30/7/overdue.
- Validator harian: jumlah ULA aktif vs outlet aktif per brand berprincipal → selisih = alert ke Head; ULA melewati MLA → flag.

### 5.3 Sanksi
```
Ajukan (Legal) → sanksi baku dihitung dari matrix (deterministik) → AI verifikasi kode (async)
→ Approve Legal (Supervisor) → Approve HR* → Tercatat → draft KB case + draft surat ST/SP
   └ deviasi dari matrix = alasan wajib; Tolak = kembali dengan alasan
```
*HR: lihat Q4 (karena akses hanya untuk Legal).

### 5.4 Jadwal cron (WIB)
| Jam | Job |
|---|---|
| 06:00 | Sync karyawan Legal dari Google Sheet |
| 07:00 | Scan perizinan + somasi → reminder, tugas, eskalasi |
| 07:15 | Scan perjanjian + validator ULA/MLA |
| 07:30 | Briefing pagi per PIC (AI) |
| Senin 08:00 | Weekly digest |

> Vercel Hobby hanya mengizinkan cron 1x/hari per job; semua job di atas bisa digabung ke satu cron 06:00 WIB berurutan. Pro plan lebih fleksibel.

---

## 6. AI — dari "chat yang menjawab" ke agen yang membantu

**Guardrail tetap (dari blueprint):** tingkat sanksi selalu lookup matrix, AI tidak mengubahnya · semua output AI = *draft / usulan*, manusia yang klik konfirmasi · wajib menyebut ID sumber · jujur bila data tidak ada · tanpa nama pelanggar · setiap panggilan tercatat di `ai_runs`.

### 6.1 Tanya LDMS (agentic chat) — fitur utama
Daripada mengirim seluruh database ke prompt (blueprint §12.2, tidak skalabel), Claude diberi **tools** yang membaca DB sesuai hak akses user:

| Tool | Contoh pertanyaan |
|---|---|
| `search_permits(filter)` | "Izin apa yang overdue dan siapa PIC-nya?" |
| `get_permit(id)` / `get_agreement(id)` | "Detail ULA-004 dan catatan negosiasinya" |
| `search_agreements(filter)` | "ULA mana yang berakhir paling dekat? Berapa unit fee-nya?" |
| `matrix_lookup(code, occurrence)` | "Sanksi merokok berulang?" → KS-04 · Repeat → SP1 |
| `search_documents(query)` (RAG, pgvector) | "Di PSM mana kita pernah dapat cap kenaikan service charge?" |
| `search_inspections(filter)` | "Temuan Disnakertrans yang berulang?" |
| `aggregate(metric)` | "Total biaya renewal 30 hari ke depan per brand" |
| `propose_action(...)` | "Tandai D0123 on progress & tambah catatan…" → muncul **kartu konfirmasi**, bukan langsung tereksekusi |

UX chat: jawaban singkat, **ID jadi chip yang bisa diklik** (buka drawer), saran pertanyaan, streaming, riwayat per user, tombol "salin" & "jadikan catatan". Chat juga bisa dibuka **kontekstual** dari drawer ("Tanya tentang dokumen ini").

### 6.2 Agen otomatis lain
1. **Intake Agent** — upload scan/PDF izin atau kontrak → AI ekstrak nomor, tanggal terbit/berakhir, unit, jenis, nilai, notice → form terisi otomatis, user tinggal cek & simpan. (Paling menghemat waktu entri data.)
2. **Briefing Agent** — tiap pagi menyusun "3–5 hal yang harus kamu kerjakan hari ini" per PIC, di Beranda + email.
3. **Renewal Copilot** — di drawer izin: checklist dokumen per jenis izin, draft surat/email ke instansi atau pengelola mal, estimasi biaya & lead time dari histori.
4. **Contract Review Agent** — pada kontrak baru: bandingkan klausul dengan Pustaka (posisi yang pernah disepakati), tandai klausul berisiko, usulkan redline. Sitasi LIB-ID.
5. **Matrix Agent** — verifikasi kode & occurrence, kriteria pembeda untuk sel "ATAU", langkah investigasi, draft surat ST/SP.
6. **Inspection Prep Agent** — dari riwayat inspeksi + status izin unit → checklist persiapan, prioritas temuan berulang.
7. **Data Quality Agent** (mingguan) — deteksi izin tanpa file, tanggal janggal, outlet aktif tanpa izin wajib, ULA hilang.

---

## 7. Fase build

| Fase | Isi | Deliverable yang bisa dicoba |
|---|---|---|
| **0. Fondasi** | Restrukturisasi navigasi & schema baru, role, sync karyawan dari Sheet, login NIK/tgl lahir + ganti password, audit trail, layout baru | Login tim Legal nyata di Vercel preview |
| **1. Perizinan** | Master jenis izin + outlet, registry, drawer, import Excel registry, upload file, somasi/ack | Data izin nyata bisa dikelola |
| **2. Reminder & Tanya LDMS v1** | Cron, tangga reminder, email template, digest, tugas otomatis; chat dengan tools perizinan | Reminder jalan; bisa tanya soal izin |
| **3. Perjanjian** | MLA/ULA/PKS/PSM, notice reminder, validator; Intake Agent untuk izin & kontrak | |
| **4. Sanksi & Matrix** | 72 kode, form, approval, deviasi, Matrix Agent, draft surat | |
| **5. Pustaka, KB, Pemeriksaan** | Library + RAG, KB case, inspeksi + Inspection Prep Agent, Contract Review | |
| **6. Beranda & polish** | Beranda "hari ini", search global Ctrl+K, briefing agent, dashboard per brand, mobile, a11y | |
| **7. UAT & go-live** | Mode UAT (sudah ada: notifikasi dialihkan), migrasi data final, panduan singkat | Production |

Tiap fase: commit ke branch ini → Vercel preview → user cek → lanjut.

---

## 8. Keamanan & privasi
- Data karyawan: hanya baris tim Legal yang diambil; tanggal lahir tidak disimpan.
- Semua route di-guard sesi + role; tool AI memakai hak akses user yang sama.
- File di Blob private, diakses via route yang cek sesi.
- Rate limit login & AI; audit setiap aksi tulis.
- Secret (DB, sheet service account, email) hanya di Vercel env.

## 9. Yang dibutuhkan dari user
- Akses Vercel (project + Neon) — sudah terhubung di session ini via MCP, tinggal konfirmasi project mana.
- Share sheet karyawan ke service account Google (read-only), atau izinkan sync via connector.
- Data registry izin per outlet (nomor, tanggal terbit/berakhir, PIC) — format apa pun, akan dibuatkan importer.
- Data agreement, library, inspeksi, KB (bila ada).

---

## 10. Keputusan (1 Nov 2026)
| # | Topik | Keputusan |
|---|---|---|
| 1 | Fitur email intake lama | Dipertahankan sebagai **Review Kontrak** (`/kontrak`) di grup History & Library |
| 2 | Role | Ernica = **CPLO**, Belinda = AGM/Head, Ronald & Arsy = Manager, Jala & Virgy = Supervisor (approver sanksi tahap Legal), Tika, Dola, Salma = Staff |
| 3 | Siapa tim Legal | Dari sheet karyawan: Position Title "Legal"/"CPLO" + departemen Legal (lihat §2). Pratinjau wajib dicek sekali sebelum sinkron pertama |
| 4 | Approval HR sanksi | Link aman ber-token di email (HR tanpa akun LDMS) |
| 5 | Database | Neon (Vercel) + file kecil di Postgres; Blob/Drive saat volume naik |
| 6 | Email | Hybrid M365 (manajerial) + GWS (staff, fokus Drive) → kirim via Graph dari mailbox Legal ke alamat mana pun; Drive untuk berbagi file |
| 7 | Data registry | Demo dulu (14 unit, 178 izin); importer Excel menyusul |
| 8 | Knowledge Base | **Tetap di Google Docs**. *KB Agent* dipicu setiap Docs berubah: Drive push notification (`files.watch`, diperpanjang tiap hari) → webhook `/api/kb/webhook` → baca Docs API → parse 7 heading → upsert `kb_cases` → AI cek nama/identitas, cocokkan kode matrix, tandai heading kurang → embedding untuk pencarian. Fallback: cron membandingkan `headRevisionId` bila notifikasi terlewat |
| 9 | Gaya | Ikut blueprint (§13) di atas token warna repo yang ada |
| 10 | Urutan | Fondasi → Perizinan → Reminder + Tanya LDMS (perizinan) → dst. |

## 11. Progres
**Fase 0 — selesai**
- Role `supervisor` baru; Jala & Virgy → Supervisor; Ernica tetap CPLO.
- Schema v8: `brands`, `units`, `permit_types`, `permits`, `permit_periods`, `notes`, `files`, `reminders`, `audit_log` (idempotent, aman untuk DB v7 yang sudah jalan).
- Sinkron karyawan dari Google Sheet (service account, tanpa SDK): pratinjau perubahan di Pengaturan → Tim & akses, tombol "Sinkron sekarang", dan otomatis di cron harian. Akun baru: password awal = tanggal lahir (hash), wajib ganti. Resign / bukan Legal lagi → akses dicabut. Peran akun yang ada tidak pernah diubah sync. Batal otomatis bila sheet tidak mengembalikan satu pun karyawan Legal.
- Navigasi baru per pilar + badge "perlu tindakan"; modul yang belum dibangun diberi label *Segera* dengan halaman penjelasan.
- Beranda baru: KPI (izin aktif, overdue, ≤30 hari + estimasi biaya, somasi belum ack, compliance), "Perlu tindakan Anda", "Perlu perhatian tim", compliance per brand, aktivitas terakhir.

**Fase 1 — selesai (data contoh)**
- 29 jenis izin master (26 dari Excel + NIB, Halal, Izin Alkohol) dengan ambang renewal, masa berlaku, instansi, estimasi biaya, blocker.
- Registry: filter cepat (Perlu tindakan, Overdue, ≤30 hari, Bersomasi, Belum diproses), cari teks (termasuk isi catatan & somasi), filter PIC/brand/scope/status; staff default melihat dokumen miliknya.
- Drawer detail: status renewal 3 tahap + **Tandai terbit** (periode lama diarsipkan, siklus baru otomatis), somasi & acknowledge, catatan bernama + waktu, upload file, tangga reminder, riwayat lengkap (audit + periode).
- Hak akses: staff hanya mengubah izin miliknya; somasi ditandai/dicabut Supervisor ke atas.

**Berikutnya — Fase 2:** reminder engine (tangga H-lead → overdue + somasi harian, email Legal-only, anti-duplikat, ack via link email), weekly digest, importer Excel registry, dan **Tanya LDMS v1** (tools perizinan).

### Setup yang dibutuhkan di Vercel
| Env | Untuk |
|---|---|
| `DATABASE_URL` | Neon (otomatis saat integrasi Neon dihubungkan) |
| `AUTH_SECRET`, `CRON_SECRET` | Sesi login & proteksi cron |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `EMPLOYEE_SHEET_ID` | Sinkron tim Legal (share sheet ke email service account sebagai Viewer) |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_MAILBOX` | Kirim email reminder (Fase 2) |

## 12. Update v9 (9 Nov 2026) — seluruh modul blueprint
- Modul baru: MLA · ULA · PKS · PSM (+ validator ULA vs outlet, notice), Reminder Engine (antrean, preview email, simulasi/kirim, outbox, weekly digest, acknowledge via link email), Pengajuan & Approval sanksi (matrix, AI verifikasi, Legal → HR via link aman, alasan pembeda wajib, tercatat ke KB), Terapkan Matrix (AI) + draft surat ST/SP, Matrix Disiplin 72 kode, Knowledge Base (Google Docs 7 heading), Government Inspection + AI, Library + konsultasi AI, Audit trail, Tanya LDMS (chat mengambang + halaman penuh, tools ke DB & Google Drive).
- Admin Console (Super Admin): hak akses peran × modul, tim & peran, alur reminder/sanksi, master data (outlet, jenis izin, brand, impor LIST OUTLET & registry), Google Drive, AI + log AI, sistem.
- Google Drive repository: Shared Drive folder → LDMS_DB (mirror semua tabel), Google Doc KB, index Docs/Sheets untuk Tanya LDMS.
- Data contoh v2 memakai outlet dari daftar outlet publik Boga Group; semua ditandai CONTOH dan bisa dihapus di Admin Console → Sistem.

### Env tambahan
| Env | Untuk |
|---|---|
| `ANTHROPIC_API_KEY` | Tanya LDMS & semua fitur AI |
| `SUPER_ADMIN_NIK` | (opsional) NIK Super Admin awal; tanpa ini akun peran Admin = Super Admin |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Sinkron karyawan + repository Google Drive |
| `RESEND_API_KEY`, `RESEND_FROM` | (nanti) kirim email reminder; sampai diisi Reminder Engine berjalan sebagai simulasi |

## v11 — 3 kategori modul, Cases, SIGAP, cohort akses

- **Navigasi:** Dashboard · Data Record (Permit & License, MLA·ULA·PKS, Government Inspection, Cases, SIGAP) · Repository (Legal Opinion, Berkas Case) · Knowledge Base (Insight & Pelajaran) · Admin Console (Reminder, Audit, Akses & pengaturan, Akun).
- **Dihapus:** PSM, Terapkan Matrix (AI), Matrix Disiplin, Pengajuan & Approval sanksi (diganti SIGAP), halaman HR approval.
- **Cases:** kategori dapat diatur Admin (default: sengketa komersial, pidana, konsumen & regulator, ketenagakerjaan); kronologi, root cause, forum, eksposur, alur penanganan (tahap → penangan → tindakan), berkas (BA/bukti/putusan → Repository), keputusan + hasil + pelajaran. Tutup case → entri KB otomatis (KB-CASE-…), juga ditulis ke Google Docs KB.
- **SIGAP:** rumah modul (embed URL dari Admin Console › Alur & SIGAP) + rekap hasil → KB (KB-SGP-…). Integrasi API menyusul.
- **Akses:** matrix per peran Tim Legal + cohort karyawan (grade, departemen/brand, kata jabatan, daftar NIK). Karyawan non-Legal login pertama dengan NIK + tanggal lahir dari sheet HR (dibaca langsung, tidak disimpan) bila cocok dengan cohort; akun dibuat dengan peran `viewer`.
- **Tampilan:** kartu diganti daftar ringkas; detail di panel samping; subjudul dan paragraf penjelasan dihapus.
