# LDMS v13 — Rencana Revisi

Tanggal: 15 Nov 2026 · Status: **dikerjakan di v13**.

Revisi 2: keputusan dari jawabanmu sudah dimasukkan (bagian 8). Tiga asumsi yang saya ambil sendiri ada di bagian 9; koreksi kalau keliru.

---

## 1. Ringkasan

| # | Feedback | Inti perubahan | Ukuran |
|---|---|---|---|
| 1 | Progress per case di thumbnail | Bar tahapan + tahap terakhir di tiap baris daftar Cases | Kecil |
| 2 | NCP di Legal Opinion | Jenis dokumen baru "NCP" di Repository | Kecil |
| 3 | Pembaruan per NCP/LO (thread) + penulis & waktu | Tabel pembaruan baru; riwayat di dalam topik | Sedang |
| 4 | AI Legal Opinion error | Perbaikan cara membaca jawaban AI | Kecil |
| 5 | Halaman awal: pilih LDMS atau SIGAP | Portal baru; SIGAP dikeluarkan dari dalam LDMS | Sedang |
| 6 | Checklist modul per akun | Hak akses per orang, diatur Super Admin dan tim Legal | Sedang |

Urutan kerja: 4 → 1 → 2+3 → 6 → 5. Poin 4 paling dulu karena itu bug yang sedang dirasakan.

---

## 2. Poin 1 — Progress di thumbnail Cases

**Sekarang:** baris case hanya menampilkan judul, kategori, outlet, titik risiko, dan chip status.

**Rencana:**
- Di bawah judul tiap baris, tampilkan **bar progress 6 langkah**: Laporan → Investigasi → Berita Acara → Eskalasi/Negosiasi → Keputusan → Penutupan. Langkah yang sudah dilewati berwarna, sisanya abu-abu.
- Di samping bar: **tahap terakhir, siapa yang menangani, dan kapan**. Contoh: "Negosiasi · Legal Manager · 12 hari lalu".
- Umur case ("berjalan 45 hari") untuk case aktif, supaya case yang mandek kelihatan.
- Data diambil dari alur penanganan yang sudah ada. Tidak perlu input baru dari tim Legal.

**Teknis:** tambah kolom hasil hitung di query daftar case. Tidak ada perubahan tabel.

**Uji:** case contoh dengan 2, 4, dan 6 langkah menampilkan bar yang benar; tampilan HP tidak melebar.

---

## 3. Poin 2 — Non Conformity Policy (NCP)

**Sekarang:** Repository › Legal Opinion punya 3 jenis: Legal Opinion, Memo hukum, Resume.

**Rencana:**
- Tambah jenis **NCP** dengan kode `LIB-NCP-001` dst.
- Menu sidebar diganti dari "Legal Opinion" menjadi **"Legal Opinion & NCP"**, dengan tab filter per jenis di atas daftar (Semua · Legal Opinion · NCP · Memo · Resume).
- Kolom khusus NCP (**sudah disetujui, sementara**):
  - Kebijakan/aturan yang disimpangi
  - Unit/departemen pemohon
  - Alasan penyimpangan
  - Risiko & mitigasi
  - Masa berlaku (mulai – berakhir)
  - Status: Diajukan / Disetujui / Ditolak / Berakhir
- **Tanpa alur persetujuan** untuk saat ini. Status diisi manual oleh tim Legal.
- NCP ikut terbaca oleh Tanya LDMS dan Konsultasi AI.

---

## 4. Poin 3 — Pembaruan per NCP / Legal Opinion (thread)

**Sekarang:** satu dokumen = satu isi. Yang tercatat hanya "terakhir diubah oleh".

**Rencana:**
- Tiap NCP/LO punya bagian **Pembaruan** di panel detailnya, tersusun seperti thread dari yang terbaru.
- Satu pembaruan berisi: **periode** (mis. "Q1 2027"), **isi pembaruan**, opsional **perubahan status** (untuk NCP, mis. diperpanjang), dan opsional **file**.
- Tiap pembaruan otomatis mencatat **nama penulis dan waktu**. Tidak bisa diisi manual.
- Di kepala dokumen tampil: **Dibuat oleh … pada …** dan **Terakhir diperbarui oleh … pada …**.
- Daftar dokumen menampilkan jumlah pembaruan dan tanggal pembaruan terakhir, dan bisa diurutkan menurut "terbaru diperbarui".
- Pembaruan **tidak bisa diedit atau dihapus**; koreksi dilakukan dengan pembaruan baru (asumsi, lihat bagian 9).
- Isi dokumen awal tetap bisa diubah oleh yang berhak, dan setiap perubahan tercatat di Audit trail.

**Teknis:**
- Tabel baru `library_updates` (dokumen, periode, isi, status baru, penulis, waktu).
- Kolom baru di `library`: `policy_ref`, `requester`, `valid_from`, `valid_to`, `status`, `created_by`.
- File pembaruan memakai fitur attach yang sudah ada (ikut aturan hapus setelah 3 tahun).
- Data LO lama: penulis awal diisi dari "terakhir diubah oleh" yang tersimpan.

**Uji:** tambah 2 pembaruan oleh 2 akun berbeda → nama dan waktu benar; akun tanpa hak ubah tidak melihat form pembaruan.

---

## 5. Poin 4 — AI Legal Opinion error

**Temuan dari log Vercel:** error-nya `AI gagal: Respons AI tidak berisi JSON`, terjadi 2 kali pada 12 Nov di halaman Repository. Artinya:
- **API key sudah benar** dan AI menjawab. Masalahnya bukan di Vercel atau kuncinya.
- Aplikasi meminta jawaban dalam format data tertentu, lalu gagal membacanya.

**Dugaan penyebab** (belum bisa dipastikan, karena isi jawaban AI tersimpan di database yang tidak bisa saya buka):
1. Jawaban terpotong karena batas panjang (2.500 token) terlalu kecil.
2. Jawaban datang sebagai teks biasa, bukan format data yang diminta.

**Rencana perbaikan** (menutup kedua dugaan):
- Ganti ke mode **structured output**, sehingga format dijamin oleh sistemnya, bukan oleh instruksi.
- Naikkan batas panjang jawaban.
- Kalau format tetap gagal: coba ulang sekali, lalu tampilkan jawaban sebagai teks biasa daripada error.
- Pesan error untuk pengguna dibuat jelas, dan detail teknisnya masuk ke Log AI.
- Perbaikan yang sama berlaku untuk **Siapkan pemeriksaan (AI)** di Government Inspection, karena memakai mekanisme yang sama.

**Uji:** 5 konsultasi berturut-turut di situs live setelah deploy, termasuk satu isu panjang.

---

## 6. Poin 5 — Halaman awal + SIGAP dikeluarkan dari LDMS

### 6a. Portal

- Halaman awal baru dengan **dua kartu besar: LDMS dan SIGAP**. Bisa dibuka tanpa login dan tidak menampilkan data apa pun.
- **Kartu LDMS** → halaman login LDMS seperti sekarang (NIK + password). Yang sudah login langsung masuk dashboard.
- **Kartu SIGAP** → membuka web SIGAP (Google Apps Script) di tab baru:
  `https://script.google.com/macros/s/AKfycbwAyEHWGU-JM9ZgXojnl4nImKKFTDZRmrAbQCNMidciqMr21cgm_shRgQWvqyq_sZYH/exec`
- Login SIGAP sepenuhnya ditangani SIGAP sendiri. LDMS tidak menyimpan atau meneruskan akun apa pun ke sana.
- Alamat SIGAP disimpan di Admin Console supaya bisa diganti tanpa deploy ulang (alamat Apps Script berubah kalau di-deploy sebagai versi baru).

**Teknis:** alamat `/` jadi portal; dashboard LDMS pindah ke `/dashboard`, dengan pengalihan otomatis supaya link lama tidak rusak.

### 6b. SIGAP di-take out dari LDMS

Yang dihapus:
- Menu **SIGAP** di sidebar dan halaman `/sigap` (tab Sistem dan tab Hasil).
- Label "On progress".
- Pengaturan SIGAP di Admin Console › Alur & SIGAP (tab kembali bernama "Alur"). Yang tersisa hanya kolom alamat SIGAP untuk portal.
- Modul "SIGAP" dari daftar hak akses, pencarian dashboard, dan Tanya LDMS.
- Data contoh SIGAP dan 3 entri Knowledge Base contoh yang berasal darinya.

**Konsekuensi yang perlu kamu tahu:**
- **Knowledge Base tidak lagi menerima pelajaran dari SIGAP.** Sumber KB tinggal Cases, Google Docs, dan input manual. Kalau nanti hasil SIGAP mau masuk KB lagi, itu butuh integrasi dengan Apps Script-nya (bisa direncanakan terpisah).
- Hasil SIGAP yang sudah dicatat manual di situs live (kalau ada) **tidak dihapus dari database**, hanya tidak ditampilkan. Entri KB-nya tetap ada dengan label sumber "SIGAP (arsip)".
- Link lama ke `/sigap` dialihkan ke portal.

**Uji:** portal tampil tanpa login; kartu SIGAP membuka alamat Apps Script; tidak ada sisa kata "SIGAP" di sidebar, pencarian, atau Admin Console selain kolom alamat.

---

## 7. Poin 6 — Checklist modul per akun

**Sekarang:** hak akses diatur per peran (tim Legal) dan per cohort (karyawan lain). Belum ada pengaturan per satu orang.

**Rencana:**
- Halaman baru **"Akses user"** dengan daftar akun. Tiap akun punya tombol **"Atur akses"** yang membuka checklist modul: Dashboard, Tanya LDMS, Permit & License, MLA·ULA·PKS, Government Inspection, Cases, Repository, Knowledge Base, Reminder, Audit trail.
- Tiap modul punya tiga tingkat: **Lihat · Ubah · Approve**.
- **Tim Legal:** default semua modul terbuka (mengikuti perannya).
- **Departemen lain:** default tidak ada akses. Modul dibuka dengan mencentang.
- **Menambah user dari departemen lain:** cari nama/NIK dari data karyawan HR → centang modulnya → simpan. Orang itu lalu login dengan NIK + tanggal lahir (wajib ganti password).
- Di daftar akun tampil ringkasan akses tiap orang, mis. "Cases, Knowledge Base (lihat)".
- Setiap perubahan akses tercatat di Audit trail: siapa mengubah akses siapa, dari apa ke apa.

**Siapa yang boleh mengatur (keputusan: Super Admin dan tim Legal):**
- **Tim Legal** (semua akun berperan Legal) bisa membuka halaman "Akses user", menambah user dari departemen lain, dan mengatur checklist mereka.
- **Hanya Super Admin** yang bisa: mengubah akses sesama anggota tim Legal, mengubah peran, dan menetapkan Super Admin (asumsi pengaman, lihat bagian 9).
- Halaman "Akses user" ditaruh di grup Admin Console pada sidebar dan terlihat oleh tim Legal. Tab Admin Console lainnya (Master data, Google Drive, AI, Sistem) tetap khusus Super Admin.

**Aturan gabungan:**
1. Super Admin selalu punya semua akses.
2. Kalau akun punya **checklist pribadi**, itulah yang berlaku untuk akun itu.
3. Kalau tidak punya, berlaku peran (tim Legal) atau cohort (karyawan lain).

Cohort tetap dipertahankan untuk membuka akses ke banyak orang sekaligus; checklist pribadi untuk pengaturan per orang.

**Teknis:** kolom baru `perms` di tabel akun; fungsi cek akses membaca dari sana lebih dulu. Semua halaman dan aksi sudah lewat satu fungsi cek, jadi perubahannya terpusat.

**Uji:**
- Akun non-Legal dengan hanya "Cases: lihat" → sidebar hanya Cases; URL modul lain ditolak; tombol tambah/ubah tidak muncul; Tanya LDMS hanya menjawab dari Cases.
- Akun Staff Legal bisa mengatur akses user departemen lain, tapi tidak bisa mengubah akses rekan Legal atau dirinya sendiri.

---

## 8. Keputusan yang sudah diambil

| | Pertanyaan | Keputusan |
|---|---|---|
| A | Lanjutan poin 2 yang terpotong | Dilewati |
| B | Kolom NCP | Pakai kolom usulan; tanpa alur approval dulu |
| D | Alamat SIGAP | Sudah ada (Google Apps Script); kartu portal membuka alamat itu |
| E | Menu SIGAP di LDMS | Di-take out seluruhnya |
| F | Yang mengatur akses user | Super Admin dan tim Legal |

## 9. Asumsi saya (koreksi kalau keliru)

1. **Pembaruan thread tidak bisa diedit atau dihapus.** Belum kamu jawab; saya pakai usulan awal demi jejak yang utuh.
2. **Tim Legal hanya mengatur akses user departemen lain.** Akses sesama Legal, peran, dan status Super Admin tetap di tangan Super Admin. Tanpa batas ini, seorang staff bisa menaikkan aksesnya sendiri.
3. **"Take out SIGAP" mencakup aliran hasil SIGAP ke Knowledge Base.** Kalau yang dimaksud hanya menu sistemnya dan rekap "Hasil SIGAP → KB" mau dipertahankan, bilang saja; itu perubahan kecil di rencana.

---

## 10. Yang tidak berubah

- Login NIK + password dan database karyawan.
- Data yang sudah ada (izin, perjanjian, case, KB). Perubahan database bersifat menambah; data SIGAP lama disembunyikan, tidak dihapus.
- Aturan file: maksimal 4 MB, dihapus otomatis setelah 3 tahun.

## 11. Cara kirim

Saya kerjakan dan tes di salinan lokal → kirim bundle → kamu push → saya deploy dan cek log. Bisa satu bundle untuk semua poin, atau dua (poin 4 dulu sebagai perbaikan cepat) kalau AI-nya mau segera dipakai.

## 12. Masih terbuka dari sebelumnya

- Pembersihan nama, jabatan, dan email tim Legal dari repo GitHub (menunggu keputusanmu).
- Cek region database Neon (Singapura atau bukan) untuk kecepatan.
- `RESEND_API_KEY` untuk pengiriman reminder sungguhan; link folder Shared Drive.
