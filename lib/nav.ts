// LDMS navigation (blueprint §3): one entry per screen.
import type { Module } from "./access";

export interface NavItem {
  href: string;
  label: string;
  title: string;
  sub: string;
  module?: Module;
  superAdmin?: boolean;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "Ringkasan", items: [
    { href: "/", label: "Dashboard", title: "Dashboard Compliance", sub: "Registry aktif · outlet · Head Office · Central Kitchen", module: "dashboard" },
  ] },
  { label: "Permit", items: [
    { href: "/perizinan", label: "Registry Perizinan", title: "Registry Permit & License", sub: "Master list izin Legal — ambang renewal berbeda per jenis", module: "permit" },
    { href: "/perjanjian", label: "MLA · ULA · PKS · PSM", title: "Agreement — MLA, ULA, PKS & PSM", sub: "Satu MLA per brand berprincipal; ULA per outlet brand tersebut", module: "agreement" },
    { href: "/reminder", label: "Reminder Engine", title: "Reminder Engine", sub: "Trigger harian — notifikasi beredar di internal tim Legal saja", module: "reminder" },
  ] },
  { label: "Punishment", items: [
    { href: "/sanksi", label: "Pengajuan & Approval", title: "Punishment — Pengajuan & Approval", sub: "Pencatatan → review Legal → review HR → tercatat sebagai preseden", module: "punishment" },
  ] },
  { label: "Library", items: [
    { href: "/pustaka", label: "Perjanjian & Legal Opinion", title: "Library Perjanjian & Legal Opinion", sub: "Rekomendasi posisi negosiasi dari perjanjian & opini yang sudah direkam", module: "library" },
  ] },
  { label: "History", items: [
    { href: "/terapkan-matrix", label: "Terapkan Matrix (AI)", title: "Penerapan Matrix Disiplin", sub: "Sanksi diambil dari Summary Matrix Disiplin; AI memverifikasi klasifikasi kode & occurrence", module: "matrix_apply" },
    { href: "/pemeriksaan", label: "Government Inspection", title: "Government Inspection", sub: "Rekomendasi tindak lanjut dari riwayat pemeriksaan instansi", module: "inspection" },
    { href: "/matrix", label: "Matrix Disiplin", title: "Summary Matrix Disiplin", sub: "72 kode pelanggaran · 1st / Repeat / Severe · hak banding & line of authority", module: "matrix" },
    { href: "/kb", label: "Knowledge Base", title: "Knowledge Base Yurisprudensi", sub: "Sumber tunggal preseden — diperbarui tim Legal via Google Docs", module: "kb" },
  ] },
  { label: "Lainnya", items: [
    { href: "/audit", label: "Audit trail", title: "Audit trail", sub: "Semua aksi tercatat atas nama user yang login", module: "audit" },
    { href: "/settings", label: "Akun & sistem", title: "Akun & sistem", sub: "Tim, mode sistem, dan koneksi" },
    { href: "/admin", label: "Admin Console", title: "Admin Console", sub: "Akses, peran, alur, master data, Google Drive, dan AI — khusus Super Admin", superAdmin: true },
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
