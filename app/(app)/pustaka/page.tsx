import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  return <ComingSoon href="/pustaka" phase="Fase 5"
    points={[
      "Knowledge Base dibaca dari Google Docs “Yurisprudensi Kasus Boga Group” (7 heading wajib).",
      "KB Agent bekerja otomatis setiap kali Docs diperbarui: parse case baru/berubah, cek tidak ada nama pelanggar, cocokkan kode matrix, dan beri tanda bila heading kurang.",
      "Konsultasi AI untuk negosiasi & legal opinion berbasis dokumen historis, wajib sitasi LIB-ID + kutipan.",
      "Pencarian isi dokumen (bukan hanya judul) untuk semua file yang diunggah.",
    ]} />;
}
