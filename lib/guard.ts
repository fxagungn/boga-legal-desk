// Page-level access check: the signed-in member, or a redirect to the dashboard with a notice.
import { redirect } from "next/navigation";
import { can, getAccessCtx, isSuperAdmin, type Action, type Module } from "./access";
import { currentMember } from "./repo";

export async function pageGuard(module: Module, action: Action = "view") {
  const me = await currentMember();
  if (!me) redirect("/login");
  const access = await getAccessCtx();
  if (!can(access, me, module, action)) redirect(`/?denied=${module}`);
  return { me, access, can: (m: Module, a: Action = "view") => can(access, me, m, a), superAdmin: isSuperAdmin(me) };
}

export async function superAdminGuard() {
  const me = await currentMember();
  if (!me) redirect("/login");
  if (!isSuperAdmin(me)) redirect("/?denied=admin");
  return { me, access: await getAccessCtx() };
}
