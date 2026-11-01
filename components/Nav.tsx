"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileSignature, Gavel, Home, Inbox, Landmark, Settings, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cx } from "./ui";

interface Item { href: string; label: string; short?: string; icon: LucideIcon; soon?: boolean }

/** Menu grouped by the four LDMS pillars (blueprint §3), trimmed to the screens people actually use. */
const GROUPS: { label: string; items: Item[] }[] = [
  { label: "Ringkasan", items: [
    { href: "/", label: "Beranda", icon: Home },
    { href: "/tanya", label: "Tanya LDMS", short: "Tanya", icon: Sparkles, soon: true },
  ] },
  { label: "Permit", items: [
    { href: "/perizinan", label: "Perizinan", short: "Izin", icon: ShieldCheck },
    { href: "/perjanjian", label: "Perjanjian", short: "Perjanjian", icon: FileSignature, soon: true },
  ] },
  { label: "Punishment", items: [
    { href: "/sanksi", label: "Sanksi & Matrix", icon: Gavel, soon: true },
  ] },
  { label: "History & Library", items: [
    { href: "/pemeriksaan", label: "Pemeriksaan", icon: Landmark, soon: true },
    { href: "/pustaka", label: "Pustaka & KB", icon: BookOpen, soon: true },
    { href: "/kontrak", label: "Review Kontrak", short: "Kontrak", icon: Inbox },
  ] },
  { label: "Lainnya", items: [
    { href: "/settings", label: "Pengaturan", icon: Settings },
  ] },
];

const ALL = GROUPS.flatMap((g) => g.items);
const KONTRAK_PATHS = ["/kontrak", "/documents", "/intake"];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/kontrak") return KONTRAK_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  return path === href || path.startsWith(href + "/");
}

export function SideNav({ badges = {} }: { badges?: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex flex-col gap-4 overflow-y-auto px-1">
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-3 text-[11px] font-bold tracking-wider text-ink-3 uppercase">{g.label}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ href, label, icon: Icon, soon }) => {
              const on = isActive(path, href);
              const n = badges[href];
              return (
                <Link key={href} href={href}
                  className={cx("flex items-center gap-3 rounded-lg px-3 py-[7px] text-[14px] font-semibold transition-colors",
                    on ? "bg-brand-subtle text-brand" : soon ? "text-ink-3 hover:bg-mute-bg hover:text-ink-2" : "text-ink-2 hover:bg-mute-bg hover:text-ink")}>
                  <Icon size={18} strokeWidth={2} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {n ? <span className={cx("rounded-full px-1.5 text-[11.5px] font-bold tnum", on ? "bg-brand text-white" : "bg-brand-subtle text-brand")}>{n}</span> : null}
                  {soon && !on && <span className="text-[10.5px] font-semibold text-ink-3">Segera</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function BottomNav({ badges = {} }: { badges?: Record<string, number> }) {
  const path = usePathname();
  if (/^\/documents\/\d+/.test(path)) return null; // the document page shows its own action bar
  const tabs = ["/", "/perizinan", "/kontrak", "/settings"].map((h) => ALL.find((i) => i.href === h)!);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map(({ href, label, short, icon: Icon }) => {
        const on = isActive(path, href);
        const n = badges[href];
        return (
          <Link key={href} href={href} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-semibold", on ? "text-brand" : "text-ink-3")}>
            <Icon size={21} strokeWidth={on ? 2.4 : 2} />
            {short ?? label}
            {n ? <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-brand px-1 text-[10px] leading-4 font-bold text-white tnum">{n}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

