import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  return <ComingSoon href="/pemeriksaan" phase="Fase 5"
    points={[
      "Catat hasil, temuan, tindak lanjut, denda, dan perkiraan pemeriksaan berikutnya per unit.",
      "“Siapkan pemeriksaan”: AI menyusun checklist dari temuan berulang + status izin unit saat ini, dengan sitasi INS-ID.",
      "Daftar izin unit yang akan jatuh tempo sebelum tanggal pemeriksaan ikut ditampilkan.",
    ]} />;
}
