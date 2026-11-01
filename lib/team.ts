// Boga Group Legal team (source: HR employee list, Oct 2026). Applied once by the v6 migration;
// afterwards the team is managed from the Pengaturan page.
import type { Role } from "./workflow";

export const LEGAL_TEAM: { name: string; role: Role; title: string; email: string | null }[] = [
  { name: "Ernica Silaban", role: "cpo", title: "Human Capital & Legal Corporate Director", email: "ernica@boga.co.id" },
  { name: "Belinda Putri Febrianti", role: "agm", title: "Legal & General Affair AGM", email: "belinda@boga.co.id" },
  { name: "Ronald Christhoper Lopulisa", role: "manager", title: "Legal Corporate & IR Manager", email: "ronald.lopulisa@boga.co.id" },
  { name: "Arsy Faiqa Sulthon", role: "manager", title: "Legal Corporate & IR Manager", email: null },
  { name: "Virgiyanti Candra Devi", role: "supervisor", title: "Legal Corporate & IR Supervisor", email: "virgiyanti.devi@boga.co.id" },
  { name: "Jala Yuan", role: "supervisor", title: "Legal Permit & IR Supervisor", email: "jala.yuan@boga.co.id" },
  { name: "Salma Fauzian", role: "staff", title: "Legal Corporate Staff", email: "salma.fauzian@boga.co.id" },
  { name: "Destika Nurhayati", role: "staff", title: "Permit & Insurance Staff", email: "tika@boga.co.id" },
  { name: "J Dola Sinulingga", role: "staff", title: "Permit & Insurance Staff", email: "j.sinulingga@boga.co.id" },
];

/** Placeholder seed account -> real person who takes over its documents. */
export const PLACEHOLDER_MAP: Record<string, string> = {
  "Staff Legal 1": "Virgiyanti Candra Devi",
  "Staff Legal 2": "Salma Fauzian",
  "Manager Legal": "Ronald Christhoper Lopulisa",
  "AGM Legal": "Belinda Putri Febrianti",
  "Chief People Officer": "Ernica Silaban",
  "CPLO": "Ernica Silaban",
};
