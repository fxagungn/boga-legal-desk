// Access control, edited by the Super Admin in Admin Console:
//  1. Tim Legal — a role × module × action matrix.
//  2. Cohort karyawan — any Boga employee matched by grade, department/brand, position keywords or an explicit NIK list
//     gets the modules ticked for that cohort. Rights add up: a person gets everything any of their cohorts allows.
import { getKV, setKV } from "./db";
import type { Member } from "./repo";
import { ROLE_LABEL, type Role } from "./workflow";

export const ROLES = (Object.keys(ROLE_LABEL) as Role[]).filter((r) => r !== "viewer");

export const MODULES = {
  dashboard: "Dashboard & pencarian",
  chat: "Tanya LDMS (chat AI)",
  permit: "Permit & License",
  agreement: "MLA · ULA · PKS",
  inspection: "Government Inspection",
  cases: "Cases",
  sigap: "SIGAP",
  library: "Repository",
  kb: "Knowledge Base",
  reminder: "Reminder Engine",
  audit: "Audit trail",
} as const;
export type Module = keyof typeof MODULES;

export const ACTIONS = { view: "Lihat", edit: "Ubah / tambah", approve: "Approve / jalankan" } as const;
export type Action = keyof typeof ACTIONS;

export type AccessMatrix = Record<Module, Record<Action, Role[]>>;

const ALL: Role[] = ["staff", "supervisor", "manager", "agm", "cpo", "admin"];
const LEAD: Role[] = ["supervisor", "manager", "agm", "cpo", "admin"];

export const DEFAULT_ACCESS: AccessMatrix = {
  dashboard: { view: ALL, edit: [], approve: [] },
  chat: { view: ALL, edit: [], approve: [] },
  // Staff edit only the permits they hold (enforced in the permit rules); approve = mark / lift somasi.
  permit: { view: ALL, edit: ALL, approve: LEAD },
  agreement: { view: ALL, edit: ALL, approve: LEAD },
  inspection: { view: ALL, edit: ALL, approve: LEAD },
  // approve = close a case and publish it to the Knowledge Base
  cases: { view: ALL, edit: ALL, approve: LEAD },
  sigap: { view: ALL, edit: ALL, approve: LEAD },
  library: { view: ALL, edit: ALL, approve: LEAD },
  kb: { view: ALL, edit: ALL, approve: LEAD },
  // approve = run the reminder scan / send manually
  reminder: { view: ALL, edit: LEAD, approve: LEAD },
  audit: { view: ALL, edit: [], approve: [] },
};

export async function getAccess(): Promise<AccessMatrix> {
  const saved = (await getKV<Partial<AccessMatrix>>("access")) ?? {};
  const out = {} as AccessMatrix;
  for (const m of Object.keys(MODULES) as Module[]) out[m] = { ...DEFAULT_ACCESS[m], ...(saved[m] ?? {}) };
  return out;
}

export async function saveAccess(a: AccessMatrix) {
  await setKV("access", a);
}

/* ---------- cohorts ---------- */

export interface Cohort {
  id: string;
  name: string;
  enabled: boolean;
  /** Any of these grades (exact, as written in the HR sheet). */
  grades: string[];
  /** Dept/Outlet or Div/Brand contains any of these words. */
  depts: string[];
  /** Position title contains any of these words. */
  titles: string[];
  /** Always in this cohort, regardless of the criteria. */
  niks: string[];
  perms: Partial<Record<Module, Action[]>>;
}

export type Person = Pick<Member, "nik" | "title"> & { grade?: string | null; dept?: string | null; division?: string | null };

const has = (hay: string | null | undefined, words: string[]) => {
  const h = (hay ?? "").toLowerCase();
  return words.some((w) => w && h.includes(w.toLowerCase()));
};

/** NIK list always matches; otherwise every criterion that is filled in must match (and at least one must be filled in). */
export function inCohort(c: Cohort, p: Person): boolean {
  if (!c.enabled) return false;
  if (p.nik && c.niks.some((n) => n.toUpperCase() === p.nik!.toUpperCase())) return true;
  const checks: boolean[] = [];
  if (c.grades.length) checks.push(c.grades.some((g) => g.toLowerCase() === (p.grade ?? "").toLowerCase()));
  if (c.depts.length) checks.push(has(p.dept, c.depts) || has(p.division, c.depts));
  if (c.titles.length) checks.push(has(p.title, c.titles));
  return checks.length > 0 && checks.every(Boolean);
}

export async function getCohorts(): Promise<Cohort[]> {
  return (await getKV<Cohort[]>("cohorts")) ?? [];
}
export const saveCohorts = (c: Cohort[]) => setKV("cohorts", c);

/** Modules a person can view through cohorts (used at login and for the sidebar). */
export function cohortModules(cohorts: Cohort[], p: Person): Set<Module> {
  const out = new Set<Module>();
  for (const c of cohorts) if (inCohort(c, p)) for (const [m, acts] of Object.entries(c.perms)) if (acts?.includes("view")) out.add(m as Module);
  return out;
}

/* ---------- checks ---------- */

/** Super Admin: flagged accounts, NIKs in SUPER_ADMIN_NIK, or — until one is set — anyone with the Admin role. */
export function isSuperAdmin(m: Pick<Member, "role" | "nik"> & { is_super_admin?: boolean }, anyFlagged = true): boolean {
  if (m.is_super_admin) return true;
  const env = (process.env.SUPER_ADMIN_NIK ?? "").split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (m.nik && env.includes(m.nik.toUpperCase())) return true;
  return m.role === "admin" && (env.length === 0 || !anyFlagged);
}

export interface AccessCtx { matrix: AccessMatrix; cohorts: Cohort[] }

export async function getAccessCtx(): Promise<AccessCtx> {
  const [matrix, cohorts] = await Promise.all([getAccess(), getCohorts()]);
  return { matrix, cohorts };
}

export function can(a: AccessCtx, me: Member & Person, module: Module, action: Action = "view"): boolean {
  if (isSuperAdmin(me)) return true;
  if (me.role !== "viewer" && a.matrix[module][action].includes(me.role)) return true;
  return a.cohorts.some((c) => inCohort(c, me) && Boolean(c.perms[module]?.includes(action)));
}

/** Throws when the signed-in member lacks the permission. */
export async function requireCan(me: Member, module: Module, action: Action = "view") {
  if (!can(await getAccessCtx(), me, module, action)) {
    throw new Error(`Akses ditolak: Anda tidak punya hak "${ACTIONS[action]}" untuk ${MODULES[module]}. Hubungi Super Admin.`);
  }
}
