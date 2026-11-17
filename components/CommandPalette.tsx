"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cx } from "./ui";

type Item = { href: string; label: string; group: string };

/** ⌘K / Ctrl+K: jump to any screen the user may open, or search every module from the dashboard. */
export function CommandPalette({ allowed }: { allowed: string[] }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);

  const items = useMemo<Item[]>(() => NAV.flatMap((g) => g.items.filter((i) => allowed.includes(i.href)).map((i) => ({ href: i.href, label: i.label, group: g.label || "Umum" }))), [allowed]);
  const hits = useMemo(() => {
    const w = q.trim().toLowerCase();
    const list = items.filter((i) => !w || `${i.label} ${i.group}`.toLowerCase().includes(w));
    return w && allowed.includes("/dashboard") ? [...list, { href: `/dashboard?q=${encodeURIComponent(q.trim())}`, label: `Cari “${q.trim()}” di semua modul`, group: "Pencarian" }] : list;
  }, [q, items, allowed]);

  const open = () => { setQ(""); setAt(0); dlg.current?.showModal(); requestAnimationFrame(() => input.current?.focus()); };
  const go = (href: string) => { dlg.current?.close(); router.push(href); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
    };
    const onOpen = () => open();
    window.addEventListener("keydown", onKey);
    window.addEventListener("ld-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("ld-palette", onOpen); };
  }, []);

  useEffect(() => setAt(0), [q]);

  return (
    <dialog ref={dlg} aria-label="Buka cepat" className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-float)]"
      onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <div className="flex items-center gap-3 border-b border-line-2 px-4">
        <Search size={18} className="shrink-0 text-ink-3" aria-hidden="true" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik menu atau kata kunci…" aria-label="Cari menu atau kata kunci"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3 focus-visible:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && hits[at]) { e.preventDefault(); go(hits[at].href); }
          }} />
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3 sm:inline">Esc</kbd>
      </div>
      <ul className="max-h-[52vh] overflow-y-auto p-2" role="listbox" aria-label="Hasil">
        {hits.map((h, i) => (
          <li key={h.href} role="option" aria-selected={i === at}>
            <button type="button" onMouseEnter={() => setAt(i)} onClick={() => go(h.href)}
              className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px]", i === at ? "bg-brand-subtle text-brand-deep" : "text-ink")}>
              <span className="min-w-0 flex-1 truncate font-semibold">{h.label}</span>
              <span className="shrink-0 text-[12px] text-ink-3">{h.group}</span>
              {i === at ? <CornerDownLeft size={14} className="shrink-0 text-brand" aria-hidden="true" /> : <ArrowRight size={14} className="shrink-0 text-transparent" aria-hidden="true" />}
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-ink-2">Tidak ada menu yang cocok.</li>}
      </ul>
    </dialog>
  );
}

export const openPalette = () => window.dispatchEvent(new Event("ld-palette"));
