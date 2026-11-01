"use client";
import { useRef } from "react";
import { Search } from "lucide-react";

/** GET form that re-submits itself whenever a filter changes (text input debounced). */
export function FilterBar({ children, q, hidden }: { children: React.ReactNode; q?: string; hidden?: Record<string, string | undefined> }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const submit = () => ref.current?.requestSubmit();
  return (
    <form ref={ref} method="get" onChange={(e) => {
      const el = e.target as unknown as HTMLInputElement;
      if (el.tagName === "INPUT" && el.type === "search") {
        clearTimeout(timer.current);
        timer.current = setTimeout(submit, 350);
      } else submit();
    }} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="relative min-w-[220px] flex-1">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
        <input type="search" name="q" defaultValue={q} placeholder="Cari unit, jenis izin, nomor, PIC, kota, somasi, catatan…" className="input pl-9" aria-label="Cari" />
      </label>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap [&>select]:min-w-0 [&>select]:sm:max-w-[220px]">{children}</div>
    </form>
  );
}
