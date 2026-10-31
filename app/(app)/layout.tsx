import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { BottomNav, SideNav } from "@/components/Nav";
import { Toaster } from "@/components/actions";
import { currentMember } from "@/lib/repo";
import { ROLE_LABEL } from "@/lib/workflow";
import { logout } from "@/app/actions";
import { Avatar, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentMember();
  if (!me) redirect("/login");
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col md:px-4 md:py-5">
        <div className="mb-6 px-1"><Logo /></div>
        <SideNav />
        <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
          <Avatar name={me.name} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-bold">{me.name}</div>
            <div className="truncate text-[12px] text-ink-3">{ROLE_LABEL[me.role]}</div>
          </div>
          <form action={logout}>
            <button className="btn btn-ghost btn-sm px-2" title="Keluar" aria-label="Keluar"><LogOut size={16} /></button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <Logo sub={false} />
        <form action={logout} className="flex items-center gap-2">
          <Avatar name={me.name} size={30} />
          <button className="btn btn-ghost btn-sm px-2" aria-label="Keluar"><LogOut size={16} /></button>
        </form>
      </header>

      <main className="min-w-0 px-4 pt-5 pb-28 md:px-8 md:py-8">{children}</main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
