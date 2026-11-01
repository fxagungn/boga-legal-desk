import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon title="Sanksi & Matrix Disiplin" sub="Pengajuan → approval Legal → HR → tercatat, berdasarkan Summary Matrix Disiplin." phase="Fase 4"
    points={[
      "72 kode pelanggaran; sanksi baku dihitung dari matrix (kode × occurrence), bukan dikarang AI.",
      "AI memverifikasi kesesuaian kode, menjelaskan kriteria pembeda untuk sel “ATAU”, dan menyusun langkah investigasi.",
      "Keputusan yang menyimpang dari matrix wajib alasan pembeda. Tanpa nama/inisial karyawan.",
      "Approval HR lewat link aman di email (tanpa akun LDMS), lalu draft surat ST/SP dan case KB otomatis.",
    ]} />;
}
