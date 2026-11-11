"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { Search } from "lucide-react";
import type { SearchRow } from "@/lib/ldms/search";

const MODULES = ["Semua modul", "Permit", "Perjanjian", "Pemeriksaan", "Cases", "SIGAP", "Repository", "Knowledge Base"] as const;
const STATUS = ["Semua status", "Overdue / lewat", "≤30 hari", "31-90 hari", "Aman", "Bersomasi", "Belum acknowledge", "Belum diproses"] as const;
type Status = (typeof STATUS)[number];

function match(r: SearchRow, s: Status) {
  const d = r.days;
  switch (s) {
    case "Overdue / lewat": return d !== null && d < 0;
    case "≤30 hari": return d !== null && d >= 0 && d <= 30;
    case "31-90 hari": return d !== null && d > 30 && d <= 90;
    case "Aman": return d !== null && d > 90;
    case "Bersomasi": return r.somasi;
    case "Belum acknowledge": return r.noAck;
    case "Belum diproses": return r.belum;
    default: return true;
  }
}

function chip(d: number | null) {
  if (d === null) return null;
  if (d < 0) return { t: `Overdue ${-d}h`, c: "bg-brand text-white" };
  if (d === 0) return { t: "Hari ini", c: "bg-brand text-white" };
  if (d <= 7) return { t: `H-${d}`, c: "bg-[#fde7e9] text-[#a5161f]" };
  if (d <= 30) return { t: `H-${d}`, c: "bg-[#fff4e2] text-[#8a5a0b]" };
  if (d <= 60) return { t: `H-${d}`, c: "bg-[#fffbe8] text-[#6b5c10]" };
  return { t: `H-${d}`, c: "bg-[#f0f3f1] text-[#3f5a4d]" };
}

/** Dashboard search across every LDMS module (blueprint §12.1). Most urgent first, max 60. */
export function GlobalSearch({ rows }: { rows: SearchRow[] }) {
  const [q, setQ] = useState("");
  const [modul, setModul] = useState<(typeof MODULES)[number]>("Semua modul");
  const [status, setStatus] = useState<Status>("Semua status");

  const hits = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows
      .filter((r) => modul === "Semua modul" || r.module === modul)
      .filter((r) => match(r, status))
      .filter((r) => { const t = r.text.toLowerCase(); return words.every((w) => t.includes(w)); })
      .sort((a, b) => Number(b.noAck) - Number(a.noAck) || (a.days ?? 1e9) - (b.days ?? 1e9));
  }, [rows, q, modul, status]);

  const shown = hits.slice(0, 60);
  const active = q.trim() !== "" || modul !== "Semua modul" || status !== "Semua status";
  const mods = MODULES.filter((m) => m === "Semua modul" || rows.some((r) => r.module === m));
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Cari</span>
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input id="gsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di semua modul…" className="input h-10 pl-9 text-[14px]" />
        </label>
        <div className="flex gap-2">
          <select aria-label="Modul" value={modul} onChange={(e) => setModul(e.target.value as (typeof MODULES)[number])} className="input h-10 w-auto text-[13px]">
            {mods.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)} className="input h-10 w-auto text-[13px]">
            {STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {active && <span className="font-mono text-[12px] whitespace-nowrap text-ink-3" aria-live="polite">{hits.length > 60 ? "60+ hasil" : `${hits.length} hasil`}</span>}
      </div>
      {!active ? null : shown.length === 0 ? (
        <p className="border-t border-line-2 px-5 py-8 text-center text-[13.5px] text-ink-2">Tidak ada yang cocok.</p>
      ) : (
        <ul className="max-h-[330px] divide-y divide-line-2 overflow-y-auto border-t border-line-2">
          {shown.map((r) => {
            const c = chip(r.days);
            return (
              <li key={r.module + r.code}>
                <Link href={r.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#fafbfc] hover:no-underline">
                  <span className="hidden w-[118px] shrink-0 sm:block"><span className="rounded-[5px] bg-mute-bg px-1.5 py-px font-mono text-[10.5px] font-semibold text-ink-2">{r.module}</span></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">{r.title}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{r.sub}</span>
                  </span>
                  {r.noAck && <span className="hidden rounded-md bg-brand-soft px-1.5 py-px text-[11px] font-bold text-brand sm:inline">Belum ack</span>}
                  {c && <span className={cx("shrink-0 rounded-md px-2 py-[3px] font-mono text-[11px] font-semibold whitespace-nowrap", c.c)}>{c.t}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
