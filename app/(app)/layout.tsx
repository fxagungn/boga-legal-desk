import { redirect } from "next/navigation";
import { FlaskConical, KeyRound, Wrench } from "lucide-react";
import { getSettings, query } from "@/lib/db";
import { MobileNav, SideNav, TopBar } from "@/components/Nav";
import { Toaster } from "@/components/actions";
import { canBypassMaintenance, currentMember } from "@/lib/repo";
import { ROLE_LABEL } from "@/lib/workflow";
import { logout } from "@/app/actions";
import { initials } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/nav";
import { can, getAccessCtx, isSuperAdmin } from "@/lib/access";
import { ChatWidget } from "@/components/chat/ChatWidget";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await currentMember();
  if (!me) redirect("/login");
  if (me.must_change_password) redirect("/ganti-password");
  const settings = await getSettings();
  // Sidebar badge: my permits that need action (in renewal window, or somasi not yet acknowledged).
  const access = await getAccessCtx();
  const permitOk = can(access, me, "permit", "view");
  const [mine, total] = !permitOk ? [[], []] : await Promise.all([query<{ n: number }>(
    `select count(*)::int as n from permits p join permit_types t on t.id = p.permit_type_id join units u on u.id = p.unit_id
     where u.status = 'aktif' and p.pic_id = $1 and ((p.expiry_date - (now() at time zone 'Asia/Jakarta')::date) <= t.lead_days or (p.requires_ack and p.ack_at is null))`,
    [me.id],
  ), query<{ n: number }>(`select count(*)::int as n from permits p join units u on u.id = p.unit_id where u.status = 'aktif'`)]);
  void total;
  const badges = { "/perizinan": { n: mine[0]?.n || 0, hot: true } };
  const superAdmin = isSuperAdmin(me);
  const allowed = NAV_ITEMS.filter((i) => (i.superAdmin ? superAdmin : !i.module || can(access, me, i.module, "view"))).map((i) => i.href);
  const chatOk = can(access, me, "chat", "view");
  const roleTitle = me.title ?? ROLE_LABEL[me.role];
  const userCard = (
    <div className="border-t border-line-2 px-1.5 pt-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-ink text-[11.5px] font-bold text-white" aria-hidden="true">{initials(me.name)}</span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-bold">{me.name}</div>
          <div className="truncate text-[11.5px] font-semibold text-ink-3">{roleTitle}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <form action={logout}><button className="btn btn-sm w-full">Keluar</button></form>
        <a href="/ganti-password" className="btn btn-sm px-2.5" title="Ganti password" aria-label="Ganti password"><KeyRound size={15} /></a>
      </div>
    </div>
  );

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
    <div className="min-h-screen md:flex">
      <aside className="hidden w-[252px] shrink-0 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-screen">
        <a href="/" className="flex items-center gap-[11px] border-b border-line-2 px-5 pt-[22px] pb-[18px] hover:no-underline">
          <span className="grid h-9 w-9 place-items-center rounded-[9px] bg-brand text-[14px] font-extrabold tracking-[-0.5px] text-white" aria-hidden="true">BG</span>
          <span className="leading-tight">
            <span className="block text-[14px] font-extrabold tracking-[-0.3px] text-ink">Legal DMS</span>
            <span className="block text-[11.5px] font-medium text-ink-3">Boga Group</span>
          </span>
        </a>
        <div className="flex-1 overflow-y-auto px-3 pt-3">
          <SideNav badges={badges} allowed={allowed} />
        </div>
        <div className="px-3.5 pb-4">{userCard}</div>
      </aside>

      <MobileNav badges={badges} allowed={allowed} footer={userCard} />

      <div className="min-w-0 flex-1">
      <TopBar name={me.name} title={roleTitle} initials={initials(me.name)} />
      <main className="min-w-0 px-4 pt-5 pb-28 md:px-7 md:py-6">
        {(settings.uatMode || settings.maintenance) && (
          <div className="mx-auto mb-5 flex max-w-[1180px] flex-wrap gap-2">
            {settings.uatMode && (
              <p className="flex flex-1 items-center gap-2 rounded-xl border border-info/20 bg-info-bg px-4 py-2.5 text-[13.5px] text-info">
                <FlaskConical size={16} className="shrink-0" />
                <span><b>Mode UAT.</b> Notifikasi {settings.uatRecipient ? <>hanya ke {settings.uatRecipient}</> : "tidak dikirim"}.</span>
              </p>
            )}
            {settings.maintenance && (
              <p className="flex flex-1 items-center gap-2 rounded-xl border border-warn/20 bg-warn-bg px-4 py-2.5 text-[13.5px] text-warn">
                <Wrench size={16} className="shrink-0" /><span><b>Maintenance aktif.</b></span>
              </p>
            )}
          </div>
        )}
        {children}
      </main>
      </div>
      {chatOk && <ChatWidget name={me.name} />}
      <Toaster />
    </div>
  );
}
