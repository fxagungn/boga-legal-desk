import { cookies } from "next/headers";
import { one, query } from "./db";
import { SESSION_COOKIE, verifySession } from "./auth";
import type { Role } from "./workflow";

export interface Member {
  id: number;
  name: string;
  role: Role;
  email: string | null;
  whatsapp: string | null;
  active: boolean;
  title?: string | null;
  nik?: string | null;
  must_change_password?: boolean;
  has_password?: boolean;
  last_login_at?: string | Date | null;
  is_super_admin?: boolean;
}

export async function listMembers(activeOnly = false) {
  return query<Member>(`select id, name, role, email, whatsapp, active, title, nik, must_change_password, password_hash is not null as has_password, last_login_at, is_super_admin from team_members ${activeOnly ? "where active" : ""} order by
    case role when 'staff' then 1 when 'supervisor' then 2 when 'manager' then 3 when 'agm' then 4 when 'cpo' then 5 else 6 end, name`);
}

export async function getMember(id: number) {
  return one<Member>(`select id, name, role, email, whatsapp, active, title, nik, must_change_password, password_hash is not null as has_password, last_login_at, is_super_admin from team_members where id = $1`, [id]);
}

/** The currently signed-in member, or null. */
export async function currentMember(): Promise<Member | null> {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const m = await getMember(s.m);
  return m && m.active ? m : null;
}

export const canBypassMaintenance = (m: Member) => ["manager", "agm", "admin"].includes(m.role) || Boolean(m.is_super_admin);

/** Signed-in member allowed to change data (blocks first-login and maintenance). */
export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) throw new Error("Sesi berakhir, silakan masuk lagi.");
  if (m.must_change_password) throw new Error("Ganti password Anda terlebih dahulu.");
  const { getSettings } = await import("./db");
  const s = await getSettings();
  if (s.maintenance && !canBypassMaintenance(m)) throw new Error("Legal Desk sedang maintenance. Coba lagi nanti.");
  return m;
}
