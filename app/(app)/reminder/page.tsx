import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  return <ComingSoon href="/reminder" phase="Fase 2"
    points={[
      "Trigger harian membaca registry: izin yang menyentuh ambang renewal per jenis (H-lead, H-lead/2, H-7, H-1) dan yang overdue.",
      "Notifikasi hanya ke tim Legal: PIC dokumen dulu, lalu CC Legal Manager, lalu Head of Legal bila tidak ada tindak lanjut.",
      "Antrean hari ini + log pengiriman (siapa, kapan, via email/WhatsApp) supaya tidak ada reminder ganda.",
      "Overdue dikirim harian sampai status renewal menjadi Terbit.",
    ]} />;
}
