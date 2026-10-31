"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2, Files, Home, Settings } from "lucide-react";
import { cx } from "./ui";

const items = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/documents", label: "Semua dokumen", short: "Dokumen", icon: Files },
  { href: "/settings", label: "Pengaturan", icon: Settings },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      <Link href="/intake" className={cx("btn btn-primary mb-4 w-full", isActive(path, "/intake") && "bg-brand-hover")}>
        <FilePlus2 size={17} /> Tambah dokumen
      </Link>
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors",
            isActive(path, href) ? "bg-brand-subtle text-brand" : "text-ink-2 hover:bg-mute-bg hover:text-ink",
          )}
        >
          <Icon size={18} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  if (/^\/documents\/\d+/.test(path)) return null; // the document page shows its own action bar
  const tabs = [items[0], items[1], { href: "/intake", label: "Tambah", short: "Tambah", icon: FilePlus2 }, items[2]];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map(({ href, label, icon: Icon, ...t }) => {
        const on = isActive(path, href);
        return (
          <Link key={href} href={href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11.5px] font-semibold", on ? "text-brand" : "text-ink-3")}>
            <Icon size={21} strokeWidth={on ? 2.4 : 2} />
            {"short" in t && t.short ? t.short : label}
          </Link>
        );
      })}
    </nav>
  );
}
