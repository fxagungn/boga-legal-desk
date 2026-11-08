"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

export interface SearchRow {
  code: string;
  type: string;
  unit: string;
  number: string | null;
  pic: string;
  brand: string | null;
  city: string | null;
  days: number | null;
  renewal: string;
  inWindow: boolean;
  somasi: boolean;
  belum: boolean;
}

const STATUS = ["Semua status", "Overdue / lewat", "≤30 hari", "31-90 hari", "Aman", "Bersomasi", "Belum diproses"] as const;
type Status = (typeof STATUS)[number];

function match(r: SearchRow, s: Status) {
  const d = r.days;
  switch (s) {
    case "Overdue / lewat": return d !== null && d < 0;
    case "≤30 hari": return d !== null && d >= 0 && d <= 30;
    case "31-90 hari": return d !== null && d > 30 && d <= 90;
    case "Aman": return d === null || d > 90;
    case "Bersomasi": return r.somasi;
    case "Belum diproses": return r.belum;
    default: return true;
  }
}

function chip(d: number | null) {
  if (d === null) return { t: "—", c: "bg-mute-bg text-ink-2" };
  if (d < 0) return { t: `Overdue ${-d}h`, c: "bg-brand text-white" };
  if (d === 0) return { t: "Hari ini", c: "bg-brand text-white" };
  if (d <= 7) return { t: `H-${d}`, c: "bg-[#fde7e9] text-[#a5161f]" };
  if (d <= 30) return { t: `H-${d}`, c: "bg-[#fff4e2] text-[#8a5a0b]" };
  if (d <= 60) return { t: `H-${d}`, c: "bg-[#fffbe8] text-[#6b5c10]" };
  return { t: `H-${d}`, c: "bg-[#f0f3f1] text-[#3f5a4d]" };
}

/** Dashboard search across the registry (design: "Cari apa saja"). Other modules join this list as they are built. */
export function GlobalSearch({ rows }: { rows: SearchRow[] }) {
  const [q, setQ] = useState("");
  const [modul, setModul] = useState("Semua modul");
  const [status, setStatus] = useState<Status>("Semua status");

  const hits = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows
      .filter((r) => match(r, status))
      .filter((r) => !k || [r.code, r.type, r.unit, r.number, r.pic, r.brand, r.city, r.renewal].filter(Boolean).join(" ").toLowerCase().includes(k))
      .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  }, [rows, q, status]);

  const shown = hits.slice(0, 60);
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-2.5 border-b border-line-2 p-5 lg:flex-row lg:items-center">
        <label className="sr-only" htmlFor="gsearch">Cari</label>
        <input id="gsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari apa saja — nomor izin, outlet, jenis izin, PIC Legal…" className="input h-[38px] text-[13.5px] lg:flex-1" />
        <div className="flex gap-2.5">
          <select aria-label="Modul" value={modul} onChange={(e) => setModul(e.target.value)} className="input h-[38px] w-auto text-[13px] font-semibold">
            <option>Semua modul</option>
            <option>Perizinan</option>
          </select>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as Status)} className="input h-[38px] w-auto text-[13px] font-semibold">
            {STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <span className="font-mono text-[12px] whitespace-nowrap text-ink-3" aria-live="polite">{hits.length > 60 ? "60+ hasil — persempit pencarian" : `${hits.length} hasil`}</span>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ink-2">Tidak ada yang cocok.</p>
      ) : (
        <ul className="max-h-[330px] divide-y divide-line-2 overflow-y-auto">
          {shown.map((r) => {
            const c = chip(r.days);
            return (
              <li key={r.code}>
                <Link href={`/perizinan?pic=all&d=${r.code}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#fafbfc] hover:no-underline">
                  <span className="hidden shrink-0 rounded-[5px] bg-mute-bg px-1.5 py-px font-mono text-[10.5px] font-semibold text-ink-2 sm:inline">Perizinan</span>
                  <span className="hidden w-12 shrink-0 font-mono text-[11px] text-ink-3 sm:inline">{r.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">{r.type}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{r.unit}{r.number ? ` · ${r.number}` : ""} · PIC Legal {r.pic}</span>
                  </span>
                  {r.somasi && <span className="hidden rounded-md bg-brand-soft px-1.5 py-px text-[11px] font-bold text-brand sm:inline">Somasi</span>}
                  <span className="hidden text-[11.5px] font-medium text-ink-3 md:inline">{r.inWindow ? r.renewal : "Aktif"}</span>
                  <span className={cx("shrink-0 rounded-md px-2 py-[3px] font-mono text-[11px] font-semibold whitespace-nowrap", c.c)}>{c.t}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
