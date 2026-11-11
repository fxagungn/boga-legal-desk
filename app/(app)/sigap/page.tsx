import Link from "next/link";
import { BookOpen, ExternalLink, Plus, Unplug } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { getFlows } from "@/lib/flows";
import { listUnits } from "@/lib/ldms/permits";
import { listSigap } from "@/lib/ldms/sigap";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog } from "@/components/actions";
import { DemoBadge } from "@/components/ldms/bits";
import { saveSigapAction } from "@/app/case-actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { can, superAdmin } = await pageGuard("sigap");
  const sp = await searchParams;
  const [flows, rows, units] = await Promise.all([getFlows(), listSigap(), listUnits()]);
  const { url, newTab, categories } = flows.sigap;
  const tab = sp.tab === "hasil" ? "hasil" : "sistem";

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-line" aria-label="SIGAP">
        {([["sistem", "Sistem SIGAP"], ["hasil", `Hasil → Knowledge Base (${rows.length})`]] as const).map(([k, l]) => (
          <Link key={k} href={k === "sistem" ? "/sigap" : "/sigap?tab=hasil"} aria-current={tab === k ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 pb-2.5 text-[13.5px] font-semibold hover:no-underline", tab === k ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink")}>{l}</Link>
        ))}
      </nav>

      {tab === "sistem" && !url && (
        <section className="card grid place-items-center px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-mute-bg text-ink-3"><Unplug size={22} /></span>
          <p className="mt-3 text-[15px] font-bold">SIGAP belum tersambung</p>
          <p className="mt-1 text-[13px] text-ink-2">Sistem SIGAP akan tampil di sini.</p>
          <div className="mt-4 flex gap-2">
            {superAdmin && <Link href="/admin?tab=alur" className="btn btn-primary btn-sm">Sambungkan</Link>}
            <Link href="/sigap?tab=hasil" className="btn btn-sm">Lihat hasil</Link>
          </div>
        </section>
      )}

      {tab === "sistem" && url && (newTab ? (
        <section className="card grid place-items-center px-6 py-14 text-center">
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary">Buka SIGAP <ExternalLink size={15} /></a>
        </section>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-end border-b border-line-2 px-4 py-2">
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold">Buka di tab baru <ExternalLink size={12} /></a>
          </div>
          <iframe src={url} title="SIGAP" className="block h-[calc(100dvh-230px)] min-h-[520px] w-full border-0" />
        </section>
      ))}

      {tab === "hasil" && (
        <>
          <section className="card overflow-hidden">
            <header className="flex flex-wrap items-center gap-2 px-5 py-3.5">
              <h2 className="text-[15px] font-extrabold">Hasil SIGAP</h2>
              <span className="font-mono text-[12px] text-ink-3">{rows.length}</span>
              {can("sigap", "edit") && (
                <span className="ml-auto">
                  <ActionDialog action={saveSigapAction} id={0} trigger={<><Plus size={16} /> Catat hasil</>} triggerClass="btn btn-primary btn-sm" title="Catat hasil SIGAP" submit="Simpan">
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="label" htmlFor="sg-d">Tanggal</label><input id="sg-d" name="result_date" type="date" required className="input" /></div>
                        <div><label className="label" htmlFor="sg-r">No. SIGAP</label><input id="sg-r" name="ref" className="input" /></div>
                      </div>
                      <div><label className="label" htmlFor="sg-u">Outlet / unit</label><select id="sg-u" name="unit_id" className="input"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                      <div><label className="label" htmlFor="sg-c">Kategori</label><select id="sg-c" name="category" className="input">{categories.map((c) => <option key={c}>{c}</option>)}</select></div>
                      <div><label className="label" htmlFor="sg-v">Pelanggaran (tanpa nama karyawan)</label><input id="sg-v" name="violation" required className="input" /></div>
                      <div><label className="label" htmlFor="sg-k">Keputusan / sanksi</label><input id="sg-k" name="decision" className="input" /></div>
                      <div><label className="label" htmlFor="sg-rc">Root cause</label><input id="sg-rc" name="root_cause" className="input" /></div>
                      <div><label className="label" htmlFor="sg-l">Pelajaran</label><textarea id="sg-l" name="lesson" rows={2} className="input" /></div>
                    </div>
                  </ActionDialog>
                </span>
              )}
            </header>
            {rows.length === 0 ? <p className="border-t border-line-2 px-5 py-8 text-center text-[13px] text-ink-2">Belum ada hasil.</p> : (
              <ul className="divide-y divide-line-2 border-t border-line-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{r.violation}</div>
                      <div className="truncate text-[12px] text-ink-3">{formatDate(r.result_date)} · {r.unit_name ?? "—"}{r.category ? ` · ${r.category}` : ""}</div>
                    </div>
                    {r.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
                    {r.decision && <span className="hidden shrink-0 rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand sm:inline">{r.decision}</span>}
                    {r.kb_code && <Link href={`/kb?d=${r.kb_code}`} className="btn btn-ghost btn-sm shrink-0 px-2" title="Lihat di Knowledge Base" aria-label="Lihat di Knowledge Base"><BookOpen size={15} /></Link>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
