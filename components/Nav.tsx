"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gavel, LayoutDashboard, Menu, ShieldCheck, X } from "lucide-react";
import { isActive, NAV, NAV_ITEMS, navFor } from "@/lib/nav";
import { cx } from "./ui";

export function SideNav({ badges = {}, allowed, onNavigate }: { badges?: Record<string, { n: number; hot?: boolean }>; allowed: string[]; onNavigate?: () => void }) {
  const path = usePathname();
  let n = 0;
  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-0.5">
      {NAV.map((g) => g.items.some((it) => allowed.includes(it.href)) && (
        <div key={g.label} className="mb-1.5">
          <p className="mt-2 mb-1.5 px-2 text-[10.5px] font-bold tracking-[0.9px] text-ink-3 uppercase">{g.label}</p>
          {g.items.filter((it) => allowed.includes(it.href)).map((it) => {
            const num = g.label === "Lainnya" ? "··" : String(++n).padStart(2, "0");
            const on = isActive(path, it.href);
            const b = badges[it.href];
            return (
              <Link key={it.href} href={it.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                className={cx("flex items-center gap-2.5 rounded-lg border px-2.5 py-[6px] text-[13px] transition-colors",
                  on ? "border-brand-line bg-brand-subtle font-bold text-brand-hover" : "border-transparent font-medium hover:bg-mute-bg",
                  !on && "text-[#3a4048]")}>
                <span className={cx("w-[18px] shrink-0 font-mono text-[11px]", on ? "text-brand" : "text-ink-3")}>{num}</span>
                <span className="min-w-0 flex-1 leading-snug">{it.label}</span>
                {b && b.n > 0 ? (
                  <span className={cx("rounded-[5px] px-1.5 py-px font-mono text-[10.5px] font-semibold", b.hot ? "bg-brand-soft text-brand" : "bg-mute-bg text-ink-2")}>{b.n}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Page title strip at the top of every screen (design: title + sub on the left, date and user on the right). */
export function TopBar({ name, title, initials }: { name: string; title: string; initials: string }) {
  const path = usePathname();
  const it = navFor(path);
  const today = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date());
  return (
    <header className="hidden items-center justify-between gap-6 border-b border-line bg-surface px-7 py-[18px] md:flex">
      <div className="min-w-0">
        <h1 className="text-[19px] font-extrabold tracking-[-0.35px]">{it?.title ?? "Legal DMS"}</h1>
        {it?.sub && <p className="mt-[3px] text-[12.5px] font-medium text-ink-3">{it.sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="text-right">
          <div className="text-[11px] font-medium text-ink-3">Hari ini</div>
          <div className="font-mono text-[13px] font-semibold">{today}</div>
        </div>
        <span className="h-8 w-px bg-line" aria-hidden="true" />
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[12px] font-bold text-white" aria-hidden="true">{initials}</span>
          <div className="leading-tight">
            <div className="text-[13px] font-bold">{name}</div>
            <div className="text-[11.5px] text-ink-3">{title}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Phone: title bar with a menu sheet, plus a bottom bar for the screens people use most. */
export function MobileNav({ badges = {}, allowed, footer }: { badges?: Record<string, { n: number; hot?: boolean }>; allowed: string[]; footer: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const it = navFor(path);
  const tabs = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/perizinan", label: "Registry", icon: ShieldCheck },
    { href: "/sanksi", label: "Sanksi", icon: Gavel },
  ];
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand text-[13px] font-extrabold tracking-[-0.5px] text-white" aria-hidden="true">BG</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold tracking-[-0.3px]">{it?.title ?? "Legal DMS"}</div>
          <div className="truncate text-[11.5px] text-ink-3">Legal DMS · Boga Group</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Buka menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Tutup menu" className="absolute inset-0 bg-ink/35" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col overflow-y-auto bg-surface px-3 py-4 shadow-drawer">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-[14px] font-extrabold">Menu</span>
              <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Tutup menu" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <SideNav badges={badges} allowed={allowed} onNavigate={() => setOpen(false)} />
            <div className="mt-auto pt-3">{footer}</div>
          </div>
        </div>
      )}

      <nav aria-label="Navigasi bawah" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map(({ href, label, icon: Icon }) => {
          const on = isActive(path, href);
          const n = badges[href]?.hot ? badges[href]?.n : 0;
          return (
            <Link key={href} href={href} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-semibold", on ? "text-brand" : "text-ink-3")}>
              <Icon size={21} strokeWidth={on ? 2.4 : 2} />
              {label}
              {n ? <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-brand px-1 font-mono text-[10px] leading-4 font-bold text-white">{n}</span> : null}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-semibold", !tabs.some((t) => isActive(path, t.href)) && NAV_ITEMS.some((i) => isActive(path, i.href)) ? "text-brand" : "text-ink-3")}>
          <Menu size={21} />
          Lainnya
        </button>
      </nav>
    </>
  );
}
