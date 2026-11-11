import Link from "next/link";
import { ExternalLink, Plus, Sparkles } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { aiReady } from "@/lib/ai";
import { LIBRARY_KINDS, listLibrary } from "@/lib/ldms/history";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog } from "@/components/actions";
import { DemoBadge, Drawer, SectionTitle } from "@/components/ldms/bits";
import { LibraryConsult } from "@/components/ldms/Advice";
import { saveLibraryAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; d?: string; ai?: string }> }) {
  const { can } = await pageGuard("library");
  const sp = await searchParams;
  const [all, ready] = await Promise.all([listLibrary(), aiReady()]);
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((l) => (!sp.kind || l.kind === sp.kind) && (!q || [l.code, l.title, l.parties, l.core, l.key_points].filter(Boolean).join(" ").toLowerCase().includes(q)));
  const sel = sp.d ? all.find((l) => l.code === sp.d) ?? null : null;
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ kind: sp.kind, q: sp.q, ...patch })) if (v) p.set(k, v);
    return `/repository${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-2 p-3.5">
        <form method="get" className="flex min-w-[220px] flex-1 flex-wrap gap-2">
          <label className="sr-only" htmlFor="lq">Cari</label>
          <input id="lq" name="q" defaultValue={sp.q} placeholder="Cari dokumen…" className="input h-9 min-w-[160px] flex-1" />
          <label className="sr-only" htmlFor="lk">Jenis</label>
          <select id="lk" name="kind" defaultValue={sp.kind ?? ""} className="input h-9 w-auto"><option value="">Semua jenis</option>{LIBRARY_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <button className="btn btn-sm h-9">Cari</button>
        </form>
        <Link href={href({ ai: sp.ai ? undefined : "1", d: undefined })} scroll={false} className={cx("btn", sp.ai && "border-brand-line bg-brand-subtle text-brand")}><Sparkles size={15} /> Konsultasi AI</Link>
        {can("library", "edit") && (
          <ActionDialog action={saveLibraryAction} id={0} trigger={<><Plus size={16} /> Tambah</>} triggerClass="btn btn-primary" title="Tambah dokumen" submit="Simpan">
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="lb-k">Jenis</label><select id="lb-k" name="kind" className="input">{LIBRARY_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
                <div><label className="label" htmlFor="lb-d">Tanggal</label><input id="lb-d" name="doc_date" type="date" className="input" /></div>
              </div>
              <div><label className="label" htmlFor="lb-t">Judul</label><input id="lb-t" name="title" required className="input" /></div>
              <div><label className="label" htmlFor="lb-p">Diminta oleh / pihak</label><input id="lb-p" name="parties" className="input" /></div>
              <div><label className="label" htmlFor="lb-c">Pendapat inti</label><textarea id="lb-c" name="core" rows={2} className="input" /></div>
              <div><label className="label" htmlFor="lb-kp">Rekomendasi</label><textarea id="lb-kp" name="key_points" rows={3} className="input" /></div>
              <div><label className="label" htmlFor="lb-f">Link file (Google Drive)</label><input id="lb-f" name="file_url" type="url" className="input" /></div>
            </div>
          </ActionDialog>
        )}
      </section>

      {sp.ai && (
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-extrabold">Konsultasi AI</h2>
          <LibraryConsult ai={ready.ok ? null : ready.reason} />
        </section>
      )}

      {rows.length === 0 ? <p className="card px-5 py-10 text-center text-[13px] text-ink-2">Belum ada dokumen.</p> : (
        <ul className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((l) => (
            <li key={l.id}>
              <Link href={href({ d: l.code })} scroll={false} className={cx("flex items-center gap-3 px-5 py-3 hover:bg-[#fafbfc] hover:no-underline", sel?.id === l.id && "bg-brand-subtle")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink">{l.title}</div>
                  <div className="truncate text-[12px] text-ink-3">{l.kind}{l.doc_date ? ` · ${formatDate(l.doc_date)}` : ""}</div>
                </div>
                {l.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <Drawer closeHref={href({ d: undefined })} label={`Detail ${sel.code}`} header={
          <>
            <div className="font-mono text-[12px] font-semibold text-ink-3">{sel.code} · {sel.kind}{sel.doc_date ? ` · ${formatDate(sel.doc_date)}` : ""}</div>
            <h2 className="mt-1 text-[19px] leading-snug font-bold">{sel.title}</h2>
            {sel.parties && <p className="mt-1 text-[13px] text-ink-2">{sel.parties}</p>}
          </>
        }>
          {sel.core && <section><SectionTitle>Pendapat inti</SectionTitle><p className="text-[13.5px] leading-relaxed">{sel.core}</p></section>}
          {sel.key_points && <section><SectionTitle>Rekomendasi</SectionTitle><p className="text-[13.5px] leading-relaxed">{sel.key_points}</p></section>}
          {sel.file_url && <a href={sel.file_url} target="_blank" rel="noreferrer" className="btn btn-sm">Buka file <ExternalLink size={13} /></a>}
        </Drawer>
      )}
    </div>
  );
}
