// Page-level access check: the signed-in member, or a redirect to the dashboard with a notice.
import { redirect } from "next/navigation";
import { can, getAccessCtx, isLegal, isSuperAdmin, type Action, type Module } from "./access";
import { currentMember } from "./repo";

export async function pageGuard(module: Module, action: Action = "view") {
  const me = await currentMember();
  if (!me) redirect("/login");
  const access = await getAccessCtx();
  if (!can(access, me, module, action)) redirect(`/dashboard?denied=${module}`);
  return { me, access, can: (m: Module, a: Action = "view") => can(access, me, m, a), superAdmin: isSuperAdmin(me) };
}

export async function superAdminGuard() {
  const me = await currentMember();
  if (!me) redirect("/login");
  if (!isSuperAdmin(me)) redirect("/dashboard?denied=admin");
  return { me, access: await getAccessCtx() };
}

/** Pages for the Legal team and Super Admin (Akses user). */
export async function legalGuard() {
  const me = await currentMember();
  if (!me) redirect("/login");
  if (!isLegal(me)) redirect("/dashboard?denied=akses");
  return { me, superAdmin: isSuperAdmin(me) };
}
