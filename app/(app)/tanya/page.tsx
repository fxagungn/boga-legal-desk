import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon title="Tanya LDMS" sub="Asisten AI yang menjawab dari data LDMS — selalu menyebut ID sumbernya." phase="Fase 2"
    points={[
      "Tanya bebas: “izin apa yang overdue dan siapa PIC-nya?”, “ULA mana yang berakhir paling dekat?”, “sanksi merokok berulang?”",
      "AI mencari sendiri ke registry, perjanjian, matrix, KB, dan pemeriksaan sesuai hak akses Anda — bukan menebak.",
      "ID di jawaban (D0123, ULA-004, YRS-…) bisa diklik untuk membuka detailnya.",
      "Bisa mengusulkan aksi (ubah status, tambah catatan) — selalu lewat kartu konfirmasi, tidak dieksekusi diam-diam.",
      "Bisa dibuka dari mana saja dengan Ctrl+K atau dari drawer dokumen (“Tanya tentang dokumen ini”).",
    ]} />;
}
