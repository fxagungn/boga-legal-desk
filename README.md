# Boga Legal Desk

Pelacak dokumen legal yang diisi otomatis dari email Outlook. Setiap email bersubjek `[LEGAL]` menjadi dokumen dengan PIC, workflow per jenis (kontrak vendor, kontrak prinsipal, lainnya), SLA per tahap dalam hari kerja WIB, skor prioritas yang bisa dijelaskan, proyeksi jadwal, serta reminder dan eskalasi via email dan WhatsApp.

## Cara kerja

```
Outlook shared mailbox ──webhook Graph──▶ /api/graph/webhook ─┐
                     └──cron harian sync─▶ syncMailbox()      ├─▶ ingestEmail()
Power Automate / forwarder ─────────────▶ /api/ingest         │     ├ cocokkan thread (conversationId / kode LGL / subjek)
Seret .msg/.eml di UI ──────────────────▶ /api/intake/upload ─┘     ├ dokumen baru: tag subjek + ekstraksi AI (email, PDF, DOCX)
                                                                    ├ balasan: tautkan, simpan lampiran, saran tahap dari AI
                                                                    └ notifikasi ke penanggung jawab tahap
Cron 08.00 WIB ─▶ /api/cron/daily: perpanjang webhook, sinkron 2 hari, cek SLA, eskalasi, ringkasan pagi
```

## Format subjek

`[LEGAL][VENDOR|PRINSIPAL|LAIN][URGENT][DL:2026-11-30] Judul dokumen - PT Pihak Lawan`

Tag tidak wajib selain kata kunci. Tag eksplisit selalu menang atas tebakan AI. Kode `LGL-2026-0012` di subjek menautkan email ke dokumen itu.

## Prioritas (0–100)

Deadline (≤40) + nilai kontrak (≤20) + jenis (≤10) + risiko (≤10) + urgent (12) + SLA tahap (≤14) + proyeksi telat (8). P1 ≥ 70, P2 ≥ 50, P3 ≥ 30.

## Setup Outlook (untuk IT)

1. Entra ID → App registrations → New. Buat client secret.
2. API permissions (Application): `Mail.Read`, `Mail.Send`, lalu Grant admin consent.
3. Batasi akses ke shared mailbox legal saja (Exchange Online PowerShell):
   `New-ApplicationAccessPolicy -AppId <CLIENT_ID> -PolicyScopeGroupId legal@perusahaan.co.id -AccessRight RestrictAccess -Description "Legal Desk"`
4. Isi `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_MAILBOX` di Vercel, redeploy, lalu klik **Sinkron** di Pengaturan.

Untuk email yang masih masuk ke inbox pribadi: buat rule Outlook (atau transport rule Exchange) yang meneruskan/CC email bersubjek `[LEGAL]` ke shared mailbox.

## Lokal

```
cp .env.example .env.local   # isi DATABASE_URL (Postgres apa pun) + ACCESS_CODE
npm i && npm run dev
```
Tabel dibuat otomatis saat pertama kali terhubung. Ubah tahapan/SLA di `lib/workflow.ts`.
