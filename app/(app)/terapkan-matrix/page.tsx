import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  return <ComingSoon href="/terapkan-matrix" phase="Fase 4"
    points={[
      "Isi kronologi kasus (tanpa nama/inisial karyawan) → AI mencocokkan kode pelanggaran dan occurrence (1st / Repeat / Severe).",
      "Sanksi baku diambil dari Summary Matrix Disiplin, bukan dikarang AI; sel “ATAU” dijelaskan kriteria pembedanya.",
      "Menampilkan preseden serupa dari Knowledge Base sebagai pembanding.",
      "Hasil bisa langsung dijadikan pengajuan sanksi untuk approval Legal → HR.",
    ]} />;
}
