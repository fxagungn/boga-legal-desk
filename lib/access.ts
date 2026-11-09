// Access control: a role × module × action matrix the Super Admin edits in Admin Console.
import { getKV, setKV } from "./db";
import type { Member } from "./repo";
import { ROLE_LABEL, type Role } from "./workflow";

export const ROLES = Object.keys(ROLE_LABEL) as Role[];

export const MODULES = {
  dashboard: "Dashboard & pencarian",
  chat: "Tanya LDMS (chat AI)",
  permit: "Registry perizinan",
  agreement: "MLA · ULA · PKS · PSM",
  reminder: "Reminder Engine",
  punishment: "Pengajuan & approval sanksi",
  library: "Library & konsultasi AI",
  matrix_apply: "Terapkan Matrix (AI)",
  inspection: "Government Inspection",
  matrix: "Matrix Disiplin",
  kb: "Knowledge Base",
  audit: "Audit trail",
} as const;
export type Module = keyof typeof MODULES;

export const ACTIONS = { view: "Lihat", edit: "Ubah / tambah", approve: "Approve / jalankan" } as const;
export type Action = keyof typeof ACTIONS;

export type AccessMatrix = Record<Module, Record<Action, Role[]>>;

const ALL: Role[] = ["staff", "supervisor", "manager", "agm", "cpo", "admin"];
const LEAD: Role[] = ["supervisor", "manager", "agm", "cpo", "admin"];

/** Defaults follow blueprint §1.3 (Legal = Supervisor ke atas, Legal2 = Staff). */
export const DEFAULT_ACCESS: AccessMatrix = {
  dashboard: { view: ALL, edit: [], approve: [] },
  chat: { view: ALL, edit: [], approve: [] },
  // Staff edit only the permits they hold (enforced in the permit rules); approve = mark / lift somasi.
  permit: { view: ALL, edit: ALL, approve: LEAD },
  agreement: { view: ALL, edit: ALL, approve: LEAD },
  // approve = run the reminder scan / send manually
  reminder: { view: ALL, edit: LEAD, approve: LEAD },
  // edit = submit; approve = Legal-stage approval (HR approves through a secure link)
  punishment: { view: ALL, edit: ALL, approve: LEAD },
  library: { view: ALL, edit: ALL, approve: LEAD },
  matrix_apply: { view: ALL, edit: ALL, approve: LEAD },
  inspection: { view: ALL, edit: ALL, approve: LEAD },
  matrix: { view: ALL, edit: ["admin"], approve: [] },
  kb: { view: ALL, edit: ALL, approve: LEAD },
  audit: { view: ALL, edit: [], approve: [] },
};

export async function getAccess(): Promise<AccessMatrix> {
  const saved = (await getKV<Partial<AccessMatrix>>("access")) ?? {};
  const out = {} as AccessMatrix;
  for (const m of Object.keys(MODULES) as Module[]) {
    out[m] = { ...DEFAULT_ACCESS[m], ...(saved[m] ?? {}) };
  }
  return out;
}

export async function saveAccess(a: AccessMatrix) {
  await setKV("access", a);
}

/** Super Admin: flagged accounts, NIKs in SUPER_ADMIN_NIK, or — until one is set — anyone with the Admin role. */
export function isSuperAdmin(m: Pick<Member, "role" | "nik"> & { is_super_admin?: boolean }, anyFlagged = true): boolean {
  if (m.is_super_admin) return true;
  const env = (process.env.SUPER_ADMIN_NIK ?? "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (m.nik && env.includes(m.nik.toUpperCase())) return true;
  return m.role === "admin" && (env.length === 0 || !anyFlagged);
}

export function can(a: AccessMatrix, me: Member & { is_super_admin?: boolean }, module: Module, action: Action = "view"): boolean {
  if (isSuperAdmin(me)) return true;
  return a[module][action].includes(me.role);
}

/** Throws when the signed-in member lacks the permission. */
export async function requireCan(me: Member & { is_super_admin?: boolean }, module: Module, action: Action = "view") {
  if (!can(await getAccess(), me, module, action)) {
    throw new Error(`Akses ditolak: peran ${ROLE_LABEL[me.role]} tidak punya hak "${ACTIONS[action]}" untuk ${MODULES[module]}. Hubungi Super Admin.`);
  }
}
