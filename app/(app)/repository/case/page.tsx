import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { DOC_KINDS, listCaseDocs } from "@/lib/ldms/cases";
import { formatDate } from "@/lib/time";
import { DemoBadge } from "@/components/ldms/bits";

export const dynamic = "force-dynamic";

/** Repository › Berkas Case: every file recorded on a case (BA, bukti, putusan …), grouped per case. */
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  await pageGuard("library");
  const sp = await searchParams;
  const q = (sp.q ?? "").toLowerCase();
  const docs = (await listCaseDocs()).filter((d) => (!sp.kind || d.kind === sp.kind) && (!q || [d.case_code, d.case_title, d.label, d.category].join(" ").toLowerCase().includes(q)));
  const groups = new Map<string, typeof docs>();
  for (const d of docs) groups.set(d.case_code, [...(groups.get(d.case_code) ?? []), d]);

  return (
    <div className="space-y-4">
      <form method="get" className="card flex flex-wrap items-center gap-2 p-3.5">
        <label className="sr-only" htmlFor="rq">Cari</label>
        <input id="rq" name="q" defaultValue={sp.q} placeholder="Cari berkas atau case…" className="input h-9 min-w-[200px] flex-1" />
        <label className="sr-only" htmlFor="rk">Jenis</label>
        <select id="rk" name="kind" defaultValue={sp.kind ?? ""} className="input h-9 w-auto"><option value="">Semua jenis</option>{DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <button className="btn btn-sm h-9">Cari</button>
        <span className="font-mono text-[12px] text-ink-3">{docs.length} berkas</span>
      </form>

      {groups.size === 0 ? <p className="card px-5 py-10 text-center text-[13px] text-ink-2">Belum ada berkas. Berkas ditambahkan dari detail case.</p> : (
        [...groups.entries()].map(([code, ds]) => (
          <section key={code} className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line-2 px-5 py-3">
              <Link href={`/cases?s=semua&d=${code}`} className="min-w-0 flex-1 truncate font-bold text-ink hover:text-brand hover:no-underline">{ds[0].case_title}</Link>
              {ds[0].is_demo && <DemoBadge />}
              <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{code}</span>
            </header>
            <ul className="divide-y divide-line-2">
              {ds.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="w-[100px] shrink-0 text-[11.5px] font-bold text-ink-3">{d.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold">{d.label} <ExternalLink size={12} /></a> : d.label}</span>
                  <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{d.doc_date ? formatDate(d.doc_date) : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
