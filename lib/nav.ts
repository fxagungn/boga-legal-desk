// LDMS navigation: Dashboard, then three module groups (Data Record · Repository · Knowledge Base) and Admin Console.
import type { Module } from "./access";

export interface NavItem {
  href: string;
  label: string;
  title: string;
  module?: Module;
  superAdmin?: boolean;
  /** Small status chip next to the label. */
  note?: string;
}

export const NAV: { label: string; items: NavItem[] }[] = [
  { label: "", items: [
    { href: "/", label: "Dashboard", title: "Dashboard", module: "dashboard" },
  ] },
  { label: "Data Record", items: [
    { href: "/perizinan", label: "Permit & License", title: "Permit & License", module: "permit" },
    { href: "/perjanjian", label: "MLA · ULA · PKS", title: "MLA · ULA · PKS", module: "agreement" },
    { href: "/pemeriksaan", label: "Government Inspection", title: "Government Inspection", module: "inspection" },
    { href: "/cases", label: "Cases", title: "Cases", module: "cases" },
    { href: "/sigap", label: "SIGAP", title: "SIGAP", module: "sigap", note: "On progress" },
  ] },
  { label: "Repository", items: [
    { href: "/repository", label: "Legal Opinion", title: "Repository · Legal Opinion", module: "library" },
    { href: "/repository/case", label: "Berkas Case", title: "Repository · Berkas Case", module: "library" },
  ] },
  { label: "Knowledge Base", items: [
    { href: "/kb", label: "Insight & Pelajaran", title: "Knowledge Base", module: "kb" },
  ] },
  { label: "Admin Console", items: [
    { href: "/reminder", label: "Reminder Engine", title: "Reminder Engine", module: "reminder" },
    { href: "/audit", label: "Audit trail", title: "Audit trail", module: "audit" },
    { href: "/admin", label: "Akses & pengaturan", title: "Admin Console", superAdmin: true },
    { href: "/settings", label: "Akun saya", title: "Akun saya" },
  ] },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/repository") return path === "/repository";
  return path === href || path.startsWith(href + "/");
}

export function navFor(path: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => isActive(path, i.href));
}
