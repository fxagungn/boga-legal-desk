// LDMS navigation: one entry per screen in the LDMS design.
// `preview` = the screen id in the design prototype; such screens are not built yet:
// admins see the design preview, everyone else a "segera hadir" page.

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  title: string;
  sub: string;
  preview?: string;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Ringkasan", items: [
    { href: "/", label: "Dashboard", short: "Dashboard", title: "Dashboard Compliance", sub: "Registry perizinan aktif · outlet · Head Office · Central Kitchen" },
    { href: "/tanya", label: "Tanya LDMS", short: "Tanya", title: "Tanya LDMS", sub: "Tanya apa saja soal perizinan, agreement, sanksi, preseden, dan pemeriksaan", preview: "chat" },
  ] },
  { label: "Permit", items: [
    { href: "/perizinan", label: "Registry Perizinan", short: "Registry", title: "Registry Permit & License", sub: "Master list izin Legal — ambang renewal berbeda per jenis" },
    { href: "/perjanjian", label: "MLA · ULA · PKS · PSM", title: "Agreement — MLA, ULA, PKS & PSM", sub: "Satu MLA per brand berprincipal; ULA per outlet brand tersebut", preview: "agree" },
    { href: "/reminder", label: "Reminder Engine", title: "Reminder Engine", sub: "Trigger harian — notifikasi beredar di internal tim Legal saja", preview: "reminder" },
  ] },
  { label: "Punishment", items: [
    { href: "/sanksi", label: "Pengajuan & Approval", title: "Punishment — Pengajuan & Approval", sub: "Pencatatan → review Legal → review HR → tercatat sebagai preseden", preview: "punish" },
  ] },
  { label: "Library", items: [
    { href: "/pustaka", label: "Perjanjian & Legal Opinion", title: "Library Perjanjian & Legal Opinion", sub: "Rekomendasi posisi negosiasi dari perjanjian & opini yang sudah direkam", preview: "lib" },
  ] },
  { label: "History", items: [
    { href: "/terapkan-matrix", label: "Terapkan Matrix (AI)", title: "Penerapan Matrix Disiplin", sub: "Sanksi diambil dari Summary Matrix Disiplin; AI memverifikasi klasifikasi kode & occurrence", preview: "yuris" },
    { href: "/pemeriksaan", label: "Government Inspection", title: "Government Inspection", sub: "Rekomendasi tindak lanjut dari riwayat pemeriksaan instansi", preview: "insp" },
    { href: "/matrix", label: "Matrix Disiplin", title: "Summary Matrix Disiplin", sub: "Kode pelanggaran · eskalasi 1st / Repeat / Severe · hak banding & line of authority", preview: "matrix" },
    { href: "/kb", label: "Knowledge Base", title: "Knowledge Base Yurisprudensi", sub: "Sumber tunggal preseden — diperbarui tim Legal", preview: "kb" },
  ] },
  { label: "Lainnya", items: [
    { href: "/settings", label: "Pengaturan", title: "Pengaturan", sub: "Tim, akses, dan mode sistem" },
  ] },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

export function navFor(path: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => isActive(path, i.href));
}

/** Only admins see the not-yet-built screens (as the design preview). */
export const canPreview = (role: string) => role === "admin";
