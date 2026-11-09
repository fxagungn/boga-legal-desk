"use server";

import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSettings, one, query, saveSettings } from "@/lib/db";
import { SESSION_COOKIE, signSession } from "@/lib/auth";
import { currentMember, requireMember } from "@/lib/repo";
import { isRole } from "@/lib/workflow";
import { birthPassword, hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  return v ? Number(v) : null;
};

export type Result = { ok: true; message?: string } | { error: string } | null;

/** Run a mutation and turn thrown errors into a message the UI can show. */
async function run(fn: () => Promise<void | string>): Promise<Result> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "Gagal menyimpan. Coba lagi." };
  }
}

/* ---------- auth ---------- */

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export async function login(_: unknown, f: FormData) {
  const nik = str(f, "nik").toUpperCase().replace(/\s+/g, "");
  const password = String(f.get("password") ?? "");
  if (!nik || !password) return { error: "Isi NIK dan password." };
  const m = await one<{ id: number; password_hash: string | null; must_change_password: boolean; failed_logins: number; locked_until: string | null; active: boolean }>(
    `select id, password_hash, must_change_password, failed_logins, locked_until, active from team_members where upper(nik) = $1`,
    [nik],
  );
  const wrong = { error: "NIK atau password salah." };
  if (!m || !m.active) return wrong;
  if (m.locked_until && new Date(m.locked_until) > new Date()) {
    const mins = Math.ceil((+new Date(m.locked_until) - Date.now()) / 60000);
    return { error: `Terlalu banyak percobaan. Coba lagi dalam ${mins} menit, atau minta Manager Legal me-reset password.` };
  }
  if (!m.password_hash) return { error: "Akun Anda belum punya password. Minta Manager Legal mengaturnya di Pengaturan." };
  if (!verifyPassword(password, m.password_hash)) {
    const tries = m.failed_logins + 1;
    await query(
      `update team_members set failed_logins = $2, locked_until = case when $2 >= ${MAX_TRIES} then now() + interval '${LOCK_MINUTES} minutes' else null end where id = $1`,
      [m.id, tries >= MAX_TRIES ? 0 : tries],
    );
    return tries >= MAX_TRIES ? { error: `Akun dikunci ${LOCK_MINUTES} menit karena terlalu banyak percobaan.` } : { error: `NIK atau password salah. Sisa ${MAX_TRIES - tries} percobaan.` };
  }
  await query(`update team_members set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1`, [m.id]);
  const jar = await cookies();
  // Until the initial password is changed the session lasts only for this browser session.
  jar.set(SESSION_COOKIE, await signSession(m.id), { ...COOKIE_OPTS, ...(m.must_change_password ? {} : { maxAge: 30 * 86400 }) });
  const next = str(f, "next");
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(m.must_change_password ? `/ganti-password?next=${encodeURIComponent(dest)}` : dest);
}

export async function changePasswordAction(_: unknown, f: FormData) {
  const me = await currentMember();
  if (!me) redirect("/login");
  const row = await one<{ password_hash: string | null }>(`select password_hash from team_members where id = $1`, [me.id]);
  const current = String(f.get("current") ?? "");
  const next = String(f.get("new") ?? "");
  const confirm = String(f.get("confirm") ?? "");
  if (!verifyPassword(current, row?.password_hash)) return { error: "Password saat ini salah." };
  if (next !== confirm) return { error: "Konfirmasi password tidak sama." };
  if (next === current) return { error: "Password baru harus berbeda dari yang lama." };
  const problem = passwordProblem(next, me.nik ?? null);
  if (problem) return { error: problem };
  await query(`update team_members set password_hash = $2, must_change_password = false where id = $1`, [me.id, hashPassword(next)]);
  (await cookies()).set(SESSION_COOKIE, await signSession(me.id), { ...COOKIE_OPTS, maxAge: 30 * 86400 });
  const dest = str(f, "next");
  redirect(dest.startsWith("/") && !dest.startsWith("//") ? dest : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ---------- settings ---------- */

async function requireLead() {
  const me = await requireMember();
  const { isSuperAdmin } = await import("@/lib/access");
  if (!isSuperAdmin(me)) throw new Error("Hanya Super Admin yang bisa mengubah pengaturan ini.");
  return me;
}

export async function saveMemberAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireLead();
    const id = str(f, "id");
    const role = str(f, "role");
    if (!isRole(role)) throw new Error("Peran tidak valid");
    const nik = str(f, "nik").toUpperCase().replace(/\s+/g, "") || null;
    const vals = [str(f, "name"), role, str(f, "email") || null, str(f, "whatsapp") || null, f.get("active") === "on", str(f, "title") || null, nik];
    if (!vals[0]) throw new Error("Nama wajib diisi");
    if (nik) {
      const dup = await one<{ id: number }>(`select id from team_members where upper(nik) = $1 and id <> $2`, [nik, Number(id) || 0]);
      if (dup) throw new Error(`NIK ${nik} sudah dipakai anggota lain.`);
    }
    const birth = str(f, "birth");
    if (id) {
      await query(`update team_members set name=$2, role=$3, email=$4, whatsapp=$5, active=$6, title=$7, nik=$8 where id=$1`, [Number(id), ...vals]);
      if (f.get("sa_present")) {
        const sa = f.get("is_super_admin") === "on";
        if (!sa && Number(id) === me.id) throw new Error("Anda tidak bisa mencabut status Super Admin diri sendiri.");
        await query(`update team_members set is_super_admin = $2 where id = $1`, [Number(id), sa]);
      }
    } else {
      if (!nik || !birth) throw new Error("Anggota baru wajib punya NIK dan tanggal lahir (untuk password awal).");
      await query(
        `insert into team_members (name, role, email, whatsapp, active, title, nik, password_hash, must_change_password) values ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
        [...vals, hashPassword(birthPassword(birth))],
      );
    }
    revalidatePath("/admin");
  });
}

export async function resetPasswordAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    await requireLead();
    const id = Number(str(f, "id"));
    const birth = str(f, "birth");
    if (!birth) throw new Error("Isi tanggal lahir anggota ini.");
    const m = await one<{ name: string; nik: string | null }>(`select name, nik from team_members where id = $1`, [id]);
    if (!m) throw new Error("Anggota tidak ditemukan.");
    if (!m.nik) throw new Error("Isi NIK anggota ini dulu.");
    await query(
      `update team_members set password_hash = $2, must_change_password = true, failed_logins = 0, locked_until = null where id = $1`,
      [id, hashPassword(birthPassword(birth))],
    );
    revalidatePath("/admin");
    return `Password ${m.name} direset ke tanggal lahir`;
  });
}

export async function saveSystemAction(_: Result, f: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireLead();
    const uatMode = f.get("uatMode") === "on";
    const maintenance = f.get("maintenance") === "on";
    const uatRecipient = str(f, "uatRecipient");
    if (uatMode && uatRecipient && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(uatRecipient)) throw new Error("Email penguji tidak valid.");
    const before = await getSettings();
    await saveSettings({ uatMode, uatRecipient, maintenance, maintenanceMessage: str(f, "maintenanceMessage") || before.maintenanceMessage });
    if (before.maintenance !== maintenance || before.uatMode !== uatMode) console.log(`[system] ${me.name}: uat=${uatMode} maintenance=${maintenance}`);
    revalidatePath("/", "layout");
    return "Pengaturan sistem disimpan";
  });
}

export async function deleteDemoAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireLead();
    const { deleteDemo } = await import("@/lib/ldms/seed2");
    await deleteDemo({ query: (text: string, params?: unknown[]) => query(text, params ?? []) as Promise<unknown[]> });
    const { audit } = await import("@/lib/ldms/permits");
    await audit(me, "hapus data contoh", "admin", "demo", "Semua data contoh dihapus");
    revalidatePath("/", "layout");
  });
}

/* ---------- employee sheet sync ---------- */

export async function applyEmployeeSyncAction(_?: Result, _f?: FormData): Promise<Result> {
  return run(async () => {
    const me = await requireLead();
    const { applySync } = await import("@/lib/employees");
    const r = await applySync(me.name);
    revalidatePath("/admin");
    return `Sinkron selesai: ${r.created} akun baru, ${r.linked} ditautkan, ${r.deactivated} dinonaktifkan`;
  });
}
