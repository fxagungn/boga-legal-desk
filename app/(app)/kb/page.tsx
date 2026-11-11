import Link from "next/link";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { getFlows } from "@/lib/flows";
import { listKb, type KbCase } from "@/lib/ldms/history";
import { caseInsight, getCaseConfig } from "@/lib/ldms/cases";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionButton, ActionDialog } from "@/components/actions";
import { DemoBadge, Drawer, Fact, SectionTitle } from "@/components/ldms/bits";
import { saveKbCaseAction, syncKbAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { case: "Case", sigap: "SIGAP", docs: "Google Docs", app: "Manual", demo: "Contoh" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; src?: string; d?: string }> }) {
  const { can } = await pageGuard("kb");
  const sp = await searchParams;
  const [all, flows, ins, cfg] = await Promise.all([listKb(), getFlows(), caseInsight(), getCaseConfig()]);
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((k) => (!sp.src || k.source === sp.src) && (!q || [k.code, k.title, k.unit_label, k.category, k.summary, k.root_cause, k.lesson, k.outcome].filter(Boolean).join(" ").toLowerCase().includes(q)));
  const sel = sp.d ? all.find((k) => k.code.toUpperCase() === sp.d!.toUpperCase()) ?? null : null;
  const docUrl = flows.drive.kbDocId ? `https://docs.google.com/document/d/${flows.drive.kbDocId}/edit` : null;
  const href = (d?: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, src: sp.src, d })) if (v) p.set(k, v);
    return `/kb${p.size ? `?${p}` : ""}`;
  };
  const maxRc = Math.max(1, ...ins.byRootCause.map((r) => r.n));

  return (
    <div className="space-y-5">
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Case aktif" value={ins.open} sub={`dari ${ins.total} case`} href="/cases" />
        <Stat label="Eksposur aktif" value={ins.exposureOpen ? money(ins.exposureOpen) : "—"} small href="/cases" />
        <Stat label="Rata-rata selesai" value={ins.avgDaysToClose ?? "—"} sub={ins.avgDaysToClose !== null ? "hari" : undefined} />
        <Stat label="Pelajaran" value={all.length} sub="case · SIGAP · manual" />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-[14px] font-extrabold">Case per kategori</h2>
          <ul className="mt-3 space-y-2 text-[13px]">
            {ins.byCategory.map((c) => (
              <li key={c.name}><Link href={`/cases?s=semua&cat=${encodeURIComponent(c.name)}`} className="flex justify-between gap-2 hover:no-underline"><span className="text-ink">{c.name}</span><span className="font-mono text-ink-2">{c.n}{c.open ? <span className="text-brand"> · {c.open} aktif</span> : null}</span></Link></li>
            ))}
            {ins.byCategory.length === 0 && <li className="text-ink-3">Belum ada case.</li>}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="text-[14px] font-extrabold">Root cause terbanyak</h2>
          <ul className="mt-3 space-y-2.5">
            {ins.byRootCause.slice(0, 6).map((r) => (
              <li key={r.name} className="text-[12.5px]">
                <div className="flex justify-between gap-2"><span>{r.name}</span><span className="font-mono">{r.n}</span></div>
                <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-mute-bg"><div className="h-full rounded-full bg-brand" style={{ width: `${(r.n / maxRc) * 100}%` }} /></div>
              </li>
            ))}
            {ins.byRootCause.length === 0 && <li className="text-[13px] text-ink-3">Belum ada data.</li>}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="text-[14px] font-extrabold">Hasil case</h2>
          <ul className="mt-3 space-y-2 text-[13px]">
            {ins.byOutcome.map((o) => <li key={o.name} className="flex justify-between gap-2"><span>{o.name}</span><span className="font-mono text-ink-2">{o.n}</span></li>)}
            {ins.byOutcome.length === 0 && <li className="text-ink-3">Belum ada case selesai.</li>}
          </ul>
          {ins.sigap.length > 0 && (
            <>
              <h3 className="mt-4 text-[12px] font-bold text-ink-3 uppercase">SIGAP per kategori</h3>
              <ul className="mt-2 space-y-1.5 text-[13px]">{ins.sigap.map((o) => <li key={o.name} className="flex justify-between gap-2"><span>{o.name}</span><span className="font-mono text-ink-2">{o.n}</span></li>)}</ul>
            </>
          )}
        </section>
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center gap-2 px-5 py-3.5">
          <h2 className="mr-1 text-[15px] font-extrabold">Pelajaran</h2>
          <form method="get" className="flex min-w-[200px] flex-1 flex-wrap gap-2">
            <label className="sr-only" htmlFor="kq">Cari</label>
            <input id="kq" name="q" defaultValue={sp.q} placeholder="Cari pelajaran…" className="input h-9 min-w-[160px] flex-1" />
            <label className="sr-only" htmlFor="ks">Sumber</label>
            <select id="ks" name="src" defaultValue={sp.src ?? ""} className="input h-9 w-auto"><option value="">Semua sumber</option>{["case", "sigap", "docs", "app"].map((k) => <option key={k} value={k}>{SOURCE[k]}</option>)}</select>
            <button className="btn btn-sm h-9">Cari</button>
          </form>
          {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="btn btn-sm" title="Buka Google Docs Knowledge Base">Docs <ExternalLink size={13} /></a>}
          {can("kb", "approve") && docUrl && <ActionButton action={syncKbAction} id={0} className="btn btn-sm" pending="Menyinkron…"><RefreshCw size={14} /> Sinkron</ActionButton>}
          {can("kb", "edit") && (
            <ActionDialog action={saveKbCaseAction} id={0} trigger={<><Plus size={16} /> Tambah</>} triggerClass="btn btn-primary btn-sm" title="Tambah pelajaran" submit="Simpan">
              <div className="grid gap-3">
                <div><label className="label" htmlFor="kb-t">Judul</label><input id="kb-t" name="title" required className="input" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label" htmlFor="kb-c">Kategori</label><select id="kb-c" name="category" className="input"><option value="">—</option>{cfg.categories.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div><label className="label" htmlFor="kb-d">Tanggal</label><input id="kb-d" name="case_date" type="date" className="input" /></div>
                </div>
                <div><label className="label" htmlFor="kb-r">Root cause</label><input id="kb-r" name="root_cause" className="input" /></div>
                <div><label className="label" htmlFor="kb-o">Hasil</label><input id="kb-o" name="outcome" className="input" /></div>
                <div><label className="label" htmlFor="kb-l">Pelajaran</label><textarea id="kb-l" name="lesson" rows={3} required className="input" /></div>
              </div>
            </ActionDialog>
          )}
        </header>
        {rows.length === 0 ? <p className="border-t border-line-2 px-5 py-8 text-center text-[13px] text-ink-2">Belum ada pelajaran.</p> : (
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {rows.map((k) => (
              <li key={k.id}>
                <Link href={href(k.code)} scroll={false} className={cx("flex items-center gap-3 px-5 py-3 hover:bg-[#fafbfc] hover:no-underline", sel?.id === k.id && "bg-brand-subtle")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink">{k.title}</div>
                    <div className="truncate text-[12.5px] text-ink-2">{k.lesson ?? k.summary ?? "—"}</div>
                  </div>
                  {k.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
                  <span className="hidden shrink-0 rounded-md bg-mute-bg px-2 py-0.5 text-[11px] font-bold text-ink-2 sm:inline">{SOURCE[k.source] ?? k.source}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sel && <KbDrawer k={sel} closeHref={href()} />}
    </div>
  );
}

function Stat({ label, value, sub, href, small }: { label: string; value: React.ReactNode; sub?: string; href?: string; small?: boolean }) {
  const body = (
    <>
      <div className="text-[11.5px] font-bold tracking-[0.6px] text-ink-2 uppercase">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5"><span className={cx("font-mono leading-none font-semibold tracking-[-0.5px]", small ? "text-[20px]" : "text-[28px]")}>{value}</span>{sub && <span className="text-[12px] text-ink-3">{sub}</span>}</div>
    </>
  );
  return href ? <Link href={href} className="card block p-5 hover:border-ink-3 hover:no-underline">{body}</Link> : <div className="card p-5">{body}</div>;
}

function KbDrawer({ k, closeHref }: { k: KbCase; closeHref: string }) {
  return (
    <Drawer closeHref={closeHref} label={`Detail ${k.code}`} header={
      <>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] font-semibold text-ink-3">{k.code} · {SOURCE[k.source] ?? k.source}{k.is_demo && <DemoBadge />}</div>
        <h2 className="mt-1 text-[19px] leading-snug font-bold">{k.title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{[k.category, k.unit_label, k.case_date ? formatDate(k.case_date) : null].filter(Boolean).join(" · ")}</p>
      </>
    }>
      <section className="rounded-xl border border-brand-line bg-brand-subtle p-4">
        <SectionTitle>Pelajaran</SectionTitle>
        <p className="text-[14px] leading-relaxed">{k.lesson ?? "—"}</p>
        {k.reasoning && <p className="mt-2 text-[13px] text-ink-2"><b>Pencegahan:</b> {k.reasoning}</p>}
      </section>
      <section className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Root cause" wide>{k.root_cause}</Fact>
        <Fact label="Keputusan" wide>{k.sanction}</Fact>
        <Fact label="Hasil">{k.outcome}</Fact>
        {k.location && <Fact label="Forum">{k.location}</Fact>}
      </section>
      {k.investigation && <section><SectionTitle>Alur penanganan</SectionTitle><p className="text-[13.5px] leading-relaxed">{k.investigation}</p></section>}
      {(k.summary || k.chronology) && <section><SectionTitle>Ringkasan</SectionTitle><p className="text-[13.5px] leading-relaxed whitespace-pre-line">{k.chronology ?? k.summary}</p></section>}
      {(k.case_code || k.sigap_code) && (
        <div>{k.case_code ? <Link href={`/cases?s=semua&d=${k.case_code}`} className="btn btn-sm">Buka {k.case_code}</Link> : <Link href="/sigap?tab=hasil" className="btn btn-sm">Buka {k.sigap_code} di SIGAP</Link>}</div>
      )}
    </Drawer>
  );
}
