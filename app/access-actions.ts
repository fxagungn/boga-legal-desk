"use server";
// Akses user: the Legal team and Super Admin decide which modules each account may open.
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { one, query } from "@/lib/db";
import { getMember, requireMember } from "@/lib/repo";
import { ACTIONS, canSetAccessOf, isLegal, MODULES, type Action, type Module } from "@/lib/access";
import { audit } from "@/lib/ldms/permits";
import type { Result } from "@/app/actions";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function run(fn: () => Promise<void | string>): Promise<Result> {
  try {
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Gagal menyimpan." };
  }
}

/** Checklist from the form: { module: [actions] }. Edit / approve imply view. */
function readPerms(f: FormData): Record<string, Action[]> {
  const out: Record<string, Action[]> = {};
  for (const m of Object.keys(MODULES) as Module[]) {
    const acts = (Object.keys(ACTIONS) as Action[]).filter((a) => f.get(`p.${m}.${a}`) === "on");
    if (acts.length && !acts.includes("view")) acts.unshift("view");
    if (acts.length) out[m] = acts;
  }
  return out;
}
const summary = (p: Record<string, Action[]>) => Object.entries(p).map(([m, a]) => `${MODULES[m as Module]} (${a.map((x) => ACTIONS[x].toLowerCase()).join("/")})`).join(", ") || "tidak ada";

/** Save one account's personal checklist. mode "default" removes it (back to role / cohort). */
export async function saveUserAccessAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    const target = await getMember(Number(str(f, "id")));
    if (!target) throw new Error("Akun tidak ditemukan.");
    if (!canSetAccessOf(me, target)) throw new Error("Anda tidak berhak mengatur akses akun ini.");
    if (str(f, "mode") === "default") {
      await query(`update team_members set perms = null where id = $1`, [target.id]);
      await audit(me, "akses user → default", "team", target.nik ?? target.id, target.name);
      return `Akses ${target.name} kembali mengikuti ${target.role === "viewer" ? "cohort" : "peran"}`;
    }
    const perms = readPerms(f);
    await query(`update team_members set perms = $2::jsonb, active = case when role = 'viewer' then true else active end where id = $1`, [target.id, JSON.stringify(perms)]);
    await audit(me, "ubah akses user", "team", target.nik ?? target.id, `${target.name}: ${summary(perms)}`);
    return `Akses ${target.name} disimpan`;
  });
}

/** Give an employee from the HR list an account (role viewer) with a checklist. They sign in with NIK + birth date. */
export async function grantEmployeeAccessAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    if (!isLegal(me)) throw new Error("Hanya tim Legal yang bisa memberi akses.");
    const nik = str(f, "nik").toUpperCase().replace(/\s+/g, "");
    const emp = await one<{ nik: string; name: string; title: string | null; grade: string | null; dept: string | null; division: string | null; email: string | null }>(
      `select nik, name, title, grade, dept, division, email from employees where nik = $1 and active`, [nik]);
    if (!emp) throw new Error("NIK tidak ditemukan di data karyawan aktif. Jalankan sinkron karyawan bila orangnya baru.");
    const perms = readPerms(f);
    if (!Object.keys(perms).length) throw new Error("Centang minimal satu modul.");
    const existing = await one<{ id: number; role: string }>(`select id, role from team_members where upper(nik) = $1`, [nik]);
    if (existing) {
      const target = await getMember(existing.id);
      if (!target || !canSetAccessOf(me, target)) throw new Error("Akun ini sudah ada dan hanya bisa diatur Super Admin.");
      await query(`update team_members set perms = $2::jsonb, active = true where id = $1`, [existing.id, JSON.stringify(perms)]);
    } else {
      await query(
        `insert into team_members (name, role, title, email, nik, grade, dept, division, perms, must_change_password, active)
         values ($1,'viewer',$2,$3,$4,$5,$6,$7,$8::jsonb,true,true)`,
        [emp.name, emp.title, emp.email, emp.nik, emp.grade, emp.dept, emp.division, JSON.stringify(perms)],
      );
    }
    await audit(me, "beri akses user", "team", emp.nik, `${emp.name}: ${summary(perms)}`);
    return `${emp.name} diberi akses. Login: NIK + tanggal lahir (DDMMYYYY)`;
  });
}

/** Switch a non-Legal account off (or back on). */
export async function toggleUserAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireMember();
    const target = await getMember(Number(str(f, "id")));
    if (!target || target.role !== "viewer" || !canSetAccessOf(me, target)) throw new Error("Anda tidak berhak mengubah akun ini.");
    await query(`update team_members set active = not active where id = $1`, [target.id]);
    await audit(me, target.active ? "nonaktifkan user" : "aktifkan user", "team", target.nik ?? target.id, target.name);
    return target.active ? `${target.name} dinonaktifkan` : `${target.name} diaktifkan`;
  });
}
