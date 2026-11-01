import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon title="MLA · ULA · PKS · PSM" sub="Semua perjanjian lisensi, kerja sama, dan sewa dalam satu tempat." phase="Fase 3"
    points={[
      "MLA hanya untuk brand berprincipal (Kimukatsu, Shaburi Kintan, Yakiniku Like); ULA satu per outlet, dalam USD/SGD.",
      "Reminder pada ambang notice di perjanjian, plus H-60, H-30, H-7, dan overdue — hanya ke tim Legal.",
      "Validator harian: jumlah ULA vs outlet aktif, dan ULA yang melewati masa MLA induk.",
      "Upload PDF perjanjian → AI mengisi pihak, nilai, tenor, notice, dan klausul terminasi untuk Anda cek.",
    ]} />;
}
