import Link from "next/link";
import { pageGuard } from "@/lib/guard";
import { query } from "@/lib/db";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const ENTITY_LABEL: Record<string, string> = { permit: "Permit", agreement: "Perjanjian", inspection: "Pemeriksaan", case: "Cases", sigap: "SIGAP", library: "Repository", kb: "Knowledge Base", reminder: "Reminder", ai_run: "AI", admin: "Admin", team: "Tim" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; e?: string; p?: string }> }) {
  await pageGuard("audit");
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.p) || 0);
  const rows = await query<{ id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null; detail: string | null }>(
    `select id, at, actor, action, entity, entity_id, detail from audit_log
     where ($1 = '' or entity = $1) and ($2 = '' or (coalesce(actor,'') || ' ' || action || ' ' || coalesce(detail,'') || ' ' || coalesce(entity_id,'')) ilike '%' || $2 || '%')
     order by at desc limit 101 offset $3`, [sp.e ?? "", sp.q ?? "", page * 100],
  );
  const more = rows.length > 100;
  const qs = (p: number) => `/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.e ? { e: sp.e } : {}), p: String(p) })}`;
  return (
    <div className="space-y-4">
      <form method="get" className="card flex flex-wrap items-center gap-2.5 p-4">
        <label className="sr-only" htmlFor="aq">Cari</label>
        <input id="aq" name="q" defaultValue={sp.q} placeholder="Cari user, aksi, ID, detail…" className="input min-w-[220px] flex-1" />
        <label className="sr-only" htmlFor="ae">Modul</label>
        <select id="ae" name="e" defaultValue={sp.e ?? ""} className="input w-auto"><option value="">Semua modul</option>{Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn">Terapkan</button>
      </form>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="border-b border-line bg-[#fafbfc] text-[11px] font-bold tracking-[0.6px] text-ink-3 uppercase"><tr><th className="px-5 py-2.5 font-bold">Waktu</th><th className="px-3 py-2.5 font-bold">User</th><th className="px-3 py-2.5 font-bold">Aksi</th><th className="px-3 py-2.5 font-bold">Modul · ID</th><th className="px-3 py-2.5 font-bold">Detail</th></tr></thead>
          <tbody className="divide-y divide-line-2">{rows.slice(0, 100).map((a) => (
            <tr key={a.id}><td className="px-5 py-2.5 font-mono text-[12px] whitespace-nowrap text-ink-3">{formatDateTime(a.at)}</td><td className="px-3 py-2.5 font-semibold">{a.actor ?? "Sistem"}</td><td className="px-3 py-2.5">{a.action}</td><td className="px-3 py-2.5 font-mono text-[12px]">{ENTITY_LABEL[a.entity] ?? a.entity}{a.entity_id ? ` · ${a.entity_id}` : ""}</td><td className="px-3 py-2.5 text-ink-2">{a.detail}</td></tr>
          ))}</tbody>
        </table>
        {rows.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-ink-2">Tidak ada aktivitas.</p>}
      </section>
      <div className="flex justify-between">{page > 0 ? <Link href={qs(page - 1)} className="btn btn-sm">← Sebelumnya</Link> : <span />}{more && <Link href={qs(page + 1)} className="btn btn-sm">Berikutnya →</Link>}</div>
    </div>
  );
}
