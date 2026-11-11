// Daily sync from the Boga employee sheet (tab EMPLOYEE): Legal team accounts, plus a cache of every employee
// (NIK, name, position, grade, dept, brand) used by the access cohorts in Admin Console.
// Who counts: Position Title matches "Legal" or "CPLO", or Dept/Outlet or Div/Brand is Legal (the permit staff are titled
// "Permit & Insurance Staff"). Resigned rows (Resign filled / Status resign) lose access.
// Birth dates only ever become a password hash for brand-new accounts; they are never stored.
import { getKV, query, setKV } from "./db";
import { readSheet, googleConfigured } from "./google";
import { birthPassword, hashPassword } from "./password";
import type { Role } from "./workflow";

export const employeeSheetId = () => process.env.EMPLOYEE_SHEET_ID?.trim() || "";
export const employeeSyncConfigured = () => googleConfigured() && Boolean(employeeSheetId());
const RANGE = () => process.env.EMPLOYEE_SHEET_RANGE || "EMPLOYEE!A:AZ";
const DEPT = () => new RegExp(process.env.EMPLOYEE_DEPT_PATTERN || "\\blegal\\b", "i");
const POSITION = () => new RegExp(process.env.EMPLOYEE_POSITION_PATTERN || "\\blegal\\b|\\bcplo\\b", "i");

export interface Employee { nik: string; name: string; title: string; email: string | null; birth: string | null; resigned: boolean; dept: string | null; division: string | null; grade: string | null; legal: boolean }

/** Guess the LDMS role from the HR position title. Only used for accounts the sync creates. */
export function roleFromTitle(title: string): Role {
  if (/\bcplo\b|chief|director|direktur/i.test(title)) return "cpo";
  if (/\bagm\b|general manager|\bhead\b/i.test(title)) return "agm";
  if (/manager/i.test(title)) return "manager";
  if (/supervisor|\bspv\b/i.test(title)) return "supervisor";
  return "staff";
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

/** Sheet birth date (serial number or text) → YYYY-MM-DD. Text dates are read day-first (Indonesian). */
export function parseBirth(v: unknown): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d));
    return y > 1900 && y < 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  if (typeof v === "number" && v > 0) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return ok(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-]+(\d{4})$/);
  if (m && MONTHS[m[2]]) return ok(+m[3], MONTHS[m[2]], +m[1]);
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every row of the HR sheet (deduplicated by NIK). `gradeColumn` is false when the sheet has no grade column. */
export async function readEmployees(): Promise<{ all: Employee[]; scanned: number; gradeColumn: boolean }> {
  if (!employeeSyncConfigured()) throw new Error("Sync karyawan belum dikonfigurasi (GOOGLE_SERVICE_ACCOUNT_JSON dan EMPLOYEE_SHEET_ID).");
  const rows = await readSheet(employeeSheetId(), RANGE());
  const [header, ...data] = rows;
  if (!header) throw new Error("Sheet karyawan kosong.");
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => norm(String(h)) === norm(n)));
  const c = {
    nik: col("Employee Id", "NIK"), name: col("Employee Name", "Nama"), title: col("Position Title", "Jabatan"),
    birth: col("Birthdate", "Tanggal Lahir"), resign: col("Resign"), status: col("Status"), email: col("Email"), dept: col("Dept/Outlet"), div: col("Div/Brand"),
    grade: col("Grade", "Job Grade", "Grade Level", "Golongan", "Level", "Job Level", "Employee Grade"),
  };
  for (const k of ["nik", "name", "title", "birth"] as const) {
    if (c[k] < 0) throw new Error(`Kolom "${{ nik: "Employee Id", name: "Employee Name", title: "Position Title", birth: "Birthdate" }[k]}" tidak ditemukan di ${RANGE()}.`);
  }
  const pattern = POSITION();
  const cell = (r: unknown[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const byNik = new Map<string, Employee>();
  for (const r of data) {
    const title = cell(r, c.title);
    const nik = cell(r, c.nik).toUpperCase().replace(/\s+/g, "");
    if (!nik) continue;
    // A combined "Human Capital & Legal" department must not pull the whole HC team in.
    const legalDept = [cell(r, c.dept), cell(r, c.div)].some((d) => DEPT().test(d) && !/human|\bhc\b|\bhr\b/i.test(d));
    const resignCell = cell(r, c.resign);
    const resigned = (resignCell !== "" && !/^(-|0|no|tidak|false)$/i.test(resignCell)) || /resign|keluar|inactive|non.?aktif/i.test(cell(r, c.status));
    const email = cell(r, c.email).toLowerCase();
    const e: Employee = {
      nik, name: cell(r, c.name), title, email: /@/.test(email) ? email : null, birth: parseBirth(c.birth >= 0 ? r[c.birth] : null), resigned,
      dept: cell(r, c.dept) || null, division: cell(r, c.div) || null, grade: cell(r, c.grade) || null, legal: pattern.test(title) || legalDept,
    };
    // The sheet has duplicate rows for some people; an active row wins over a resigned one.
    const prev = byNik.get(nik);
    if (!prev || (prev.resigned && !e.resigned)) byNik.set(nik, e);
  }
  return { all: [...byNik.values()], scanned: data.length, gradeColumn: c.grade >= 0 };
}

export async function fetchLegalEmployees(): Promise<{ legal: Employee[]; scanned: number; all: Employee[]; gradeColumn: boolean }> {
  const r = await readEmployees();
  return { legal: r.all.filter((e) => e.legal), scanned: r.scanned, all: r.all, gradeColumn: r.gradeColumn };
}

/** Cache every employee (without birth dates) so cohorts can be previewed and matched. */
async function cacheEmployees(all: Employee[]) {
  for (let i = 0; i < all.length; i += 500) {
    const part = all.slice(i, i + 500);
    await query(
      `insert into employees (nik, name, title, grade, dept, division, email, active, synced_at)
       select * , now() from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::boolean[])
       on conflict (nik) do update set name = excluded.name, title = excluded.title, grade = excluded.grade, dept = excluded.dept,
         division = excluded.division, email = excluded.email, active = excluded.active, synced_at = now()`,
      [part.map((e) => e.nik), part.map((e) => e.name), part.map((e) => e.title || null), part.map((e) => e.grade), part.map((e) => e.dept),
        part.map((e) => e.division), part.map((e) => e.email), part.map((e) => !e.resigned)],
    );
  }
  await query(`update team_members t set grade = e.grade, dept = e.dept, division = e.division from employees e where upper(t.nik) = e.nik`);
  // Non-Legal accounts follow the HR sheet: resigned or gone → no access.
  await query(`update team_members t set active = false where t.role = 'viewer' and t.active
    and not exists (select 1 from employees e where e.nik = upper(t.nik) and e.active)`);
}

/** Birth date of one employee, read live from the sheet (first login of a cohort member). Never stored. */
export async function employeeBirth(nik: string): Promise<string | null> {
  const { all } = await readEmployees();
  const e = all.find((x) => x.nik === nik.toUpperCase() && !x.resigned);
  return e?.birth ?? null;
}

export interface SyncPlan {
  scanned: number;
  legal: number;
  create: (Employee & { role: Role })[];
  link: { id: number; name: string; emp: Employee }[];
  update: { id: number; name: string; changes: string[] }[];
  deactivate: { id: number; name: string; reason: string }[];
  inactiveInApp: { id: number; name: string }[];
  noBirth: string[];
  /** Active Legal employees (server-only: holds birth dates, never render or return to the client). */
  employees: Employee[];
  /** Every employee row (server-only). */
  all: Employee[];
  gradeColumn: boolean;
}

interface MemberLite { id: number; name: string; role: string; nik: string | null; title: string | null; email: string | null; active: boolean; sheet_synced: boolean; has_password: boolean }

export async function planSync(): Promise<SyncPlan> {
  const { legal, scanned, all, gradeColumn } = await fetchLegalEmployees();
  const active = legal.filter((e) => !e.resigned);
  if (active.length === 0) throw new Error("Tidak ada karyawan aktif dengan jabatan Legal/CPLO di sheet — sync dibatalkan agar tidak ada akun yang dinonaktifkan karena kesalahan data.");
  const members = await query<MemberLite>(`select id, name, role, upper(nik) as nik, title, email, active, sheet_synced, password_hash is not null as has_password from team_members`);
  const byNik = new Map(members.filter((m) => m.nik).map((m) => [m.nik!, m]));
  const plan: SyncPlan = { scanned, legal: active.length, create: [], link: [], update: [], deactivate: [], inactiveInApp: [], noBirth: [], employees: active, all, gradeColumn };
  const seen = new Set<number>();

  for (const e of active) {
    let m = byNik.get(e.nik);
    if (!m) {
      m = members.find((x) => !x.nik && norm(x.name) === norm(e.name));
      if (m) plan.link.push({ id: m.id, name: m.name, emp: e });
    }
    if (!m) {
      plan.create.push({ ...e, role: roleFromTitle(e.title) });
      if (!e.birth) plan.noBirth.push(e.name);
      continue;
    }
    seen.add(m.id);
    if (!m.active) plan.inactiveInApp.push({ id: m.id, name: m.name });
    const changes: string[] = [];
    if (e.title && e.title !== m.title) changes.push(`jabatan → ${e.title}`);
    if (e.email && !m.email) changes.push(`email → ${e.email}`);
    if (changes.length) plan.update.push({ id: m.id, name: m.name, changes });
    if (!m.has_password && !e.birth) plan.noBirth.push(m.name);
  }

  const resignedNik = new Set(legal.filter((e) => e.resigned).map((e) => e.nik));
  for (const m of members) {
    if (!m.active || seen.has(m.id) || m.role === "viewer") continue;
    if (m.nik && resignedNik.has(m.nik)) plan.deactivate.push({ id: m.id, name: m.name, reason: "resign di data karyawan" });
    else if (m.sheet_synced) plan.deactivate.push({ id: m.id, name: m.name, reason: "tidak lagi berjabatan Legal/CPLO di data karyawan" });
  }
  return plan;
}

export interface SyncResult { at: string; created: number; linked: number; updated: number; deactivated: number; legal: number; employees?: number; gradeColumn?: boolean; error?: string }

export async function applySync(actor = "Sync otomatis"): Promise<SyncResult> {
  const plan = await planSync();
  const legal = plan.legal;
  for (const e of plan.create) {
    await query(
      `insert into team_members (name, role, title, email, nik, password_hash, must_change_password, active, sheet_synced, sheet_seen_at)
       values ($1,$2,$3,$4,$5,$6,true,true,true,now())`,
      [e.name, e.role, e.title, e.email, e.nik, e.birth ? hashPassword(birthPassword(e.birth)) : null],
    );
  }
  for (const l of plan.link) {
    await query(
      `update team_members set nik = $2, password_hash = coalesce(password_hash, $3), must_change_password = case when password_hash is null then true else must_change_password end where id = $1`,
      [l.id, l.emp.nik, l.emp.birth ? hashPassword(birthPassword(l.emp.birth)) : null],
    );
  }
  // Every active Legal employee found in the app: refresh title/email, mark as sheet-managed.
  for (const e of plan.employees) {
    await query(
      `update team_members set title = coalesce(nullif($2,''), title), email = coalesce(email, $3), sheet_synced = true, sheet_seen_at = now() where upper(nik) = $1`,
      [e.nik, e.title, e.email],
    );
  }
  for (const d of plan.deactivate) await query(`update team_members set active = false where id = $1`, [d.id]);
  await cacheEmployees(plan.all);
  const result: SyncResult = { at: new Date().toISOString(), created: plan.create.length, linked: plan.link.length, updated: plan.update.length, deactivated: plan.deactivate.length, legal, employees: plan.all.filter((e) => !e.resigned).length, gradeColumn: plan.gradeColumn };
  await setKV("employee_sync_last", { ...result, actor });
  if (plan.create.length || plan.deactivate.length) {
    await query(`insert into audit_log (actor, action, entity, entity_id, detail) values ($1,'sync karyawan','team','sheet',$2)`,
      [actor, `${plan.create.length} akun baru${plan.create.length ? ` (${plan.create.map((x) => x.name).join(", ")})` : ""}; ${plan.deactivate.length} dinonaktifkan${plan.deactivate.length ? ` (${plan.deactivate.map((x) => x.name).join(", ")})` : ""}`]);
  }
  return result;
}

export const lastSync = () => getKV<SyncResult & { actor?: string }>("employee_sync_last");
