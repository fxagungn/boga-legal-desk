import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  return <ComingSoon href="/matrix" phase="Fase 4"
    points={[
      "Seluruh kode pelanggaran Summary Matrix Disiplin dengan sanksi 1st, Repeat, dan Severe.",
      "Hak banding dan line of authority per kode.",
      "Pencarian per kategori/sub-kategori, dan tautan ke kasus KB yang memakai kode tersebut.",
    ]} />;
}
