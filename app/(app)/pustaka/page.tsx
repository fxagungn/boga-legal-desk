import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon title="Pustaka & Knowledge Base" sub="PKS, PSM, License, Legal Opinion, Resume — dan yurisprudensi kasus dari Google Docs." phase="Fase 5"
    points={[
      "Knowledge Base dibaca dari Google Docs “Yurisprudensi Kasus Boga Group” (7 heading wajib).",
      "KB Agent bekerja otomatis setiap kali Docs diperbarui: parse case baru/berubah, cek tidak ada nama pelanggar, cocokkan kode matrix, dan beri tanda bila heading kurang.",
      "Konsultasi AI untuk negosiasi & legal opinion berbasis dokumen historis, wajib sitasi LIB-ID + kutipan.",
      "Pencarian isi dokumen (bukan hanya judul) untuk semua file yang diunggah.",
    ]} />;
}
