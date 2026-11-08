import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  return <ComingSoon href="/kb" phase="Fase 5"
    points={[
      "Sumber tunggal preseden kasus, diperbarui tim Legal lewat Google Docs.",
      "Setiap case punya kode matrix, kronologi, keputusan, dan dasar pertimbangan — tanpa nama pelanggar.",
      "Dipakai AI sebagai rujukan saat menerapkan matrix dan menjawab Tanya LDMS, selalu dengan sitasi ID case.",
    ]} />;
}
