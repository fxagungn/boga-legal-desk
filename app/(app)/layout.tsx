import { redirect } from "next/navigation";
import { FlaskConical, KeyRound, LogOut, Wrench } from "lucide-react";
import { getSettings } from "@/lib/db";
import { BottomNav, SideNav } from "@/components/Nav";
import { Toaster } from "@/components/actions";
import { canBypassMaintenance, currentMember } from "@/lib/repo";
import { ROLE_LABEL } from "@/lib/workflow";
import { logout } from "@/app/actions";
import { Avatar, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentMember();
  if (!me) redirect("/login");
  if (me.must_change_password) redirect("/ganti-password");
  const settings = await getSettings();

  if (settings.maintenance && !canBypassMaintenance(me)) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warn-bg text-warn"><Wrench size={26} /></span>
          <h1 className="mt-5 text-xl font-bold">Sedang maintenance</h1>
          <p className="mt-2 text-ink-2">{settings.maintenanceMessage}</p>
          <form action={logout} className="mt-6"><button className="btn">Keluar</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen md:flex-col md:px-4 md:py-5">
        <div className="mb-6 px-1"><Logo /></div>
        <SideNav />
        <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
          <Avatar name={me.name} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13.5px] font-bold">{me.name}</div>
            <div className="truncate text-[12px] text-ink-3">{me.title ?? ROLE_LABEL[me.role]}</div>
          </div>
          <a href="/ganti-password" className="btn btn-ghost btn-sm px-2" title="Ganti password" aria-label="Ganti password"><KeyRound size={16} /></a>
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

      <main className="min-w-0 px-4 pt-5 pb-28 md:px-8 md:py-8">
        {(settings.uatMode || settings.maintenance) && (
          <div className="mx-auto mb-5 flex max-w-[1180px] flex-wrap gap-2">
            {settings.uatMode && (
              <p className="flex flex-1 items-center gap-2 rounded-xl border border-info/20 bg-info-bg px-4 py-2.5 text-[13.5px] text-info">
                <FlaskConical size={16} className="shrink-0" />
                <span><b>Mode UAT.</b> Data uji coba; notifikasi {settings.uatRecipient ? <>hanya dikirim ke {settings.uatRecipient}</> : "tidak dikirim"}.</span>
              </p>
            )}
            {settings.maintenance && (
              <p className="flex flex-1 items-center gap-2 rounded-xl border border-warn/20 bg-warn-bg px-4 py-2.5 text-[13.5px] text-warn">
                <Wrench size={16} className="shrink-0" /><span><b>Maintenance aktif.</b> Hanya Manager, AGM, dan Admin yang bisa masuk.</span>
              </p>
            )}
          </div>
        )}
        {children}
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
