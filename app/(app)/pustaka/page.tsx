import { ExternalLink, Plus } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { aiReady } from "@/lib/ai";
import { LIBRARY_KINDS, listLibrary } from "@/lib/ldms/history";
import { formatDate } from "@/lib/time";
import { ActionDialog } from "@/components/actions";
import { DemoBadge } from "@/components/ldms/bits";
import { LibraryConsult } from "@/components/ldms/Advice";
import { saveLibraryAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  const { can } = await pageGuard("library");
  const sp = await searchParams;
  const [all, ready] = await Promise.all([listLibrary(), aiReady()]);
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((l) => (!sp.kind || l.kind === sp.kind) && (!q || [l.code, l.title, l.parties, l.core, l.key_points].filter(Boolean).join(" ").toLowerCase().includes(q)));
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,460px)]">
      <section className="space-y-4">
        <div className="card flex flex-wrap items-center gap-2.5 p-4">
        <form method="get" className="flex min-w-[200px] flex-1 flex-wrap items-center gap-2.5">
          <label className="sr-only" htmlFor="lq">Cari</label>
          <input id="lq" name="q" defaultValue={sp.q} placeholder="Cari judul, pihak, isi…" className="input min-w-[200px] flex-1" />
          <label className="sr-only" htmlFor="lk">Jenis</label>
          <select id="lk" name="kind" defaultValue={sp.kind ?? ""} className="input w-auto"><option value="">Semua jenis</option>{LIBRARY_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          <button className="btn">Terapkan</button>
          <span className="font-mono text-[12px] text-ink-3">{rows.length} dokumen</span>
        </form>
          {can("library", "edit") && (
            <ActionDialog action={saveLibraryAction} id={0} trigger={<><Plus size={16} /> Tambah</>} triggerClass="btn btn-primary" title="Tambah dokumen library" submit="Simpan">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label" htmlFor="lb-k">Jenis</label><select id="lb-k" name="kind" className="input">{LIBRARY_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
                  <div><label className="label" htmlFor="lb-d">Tanggal</label><input id="lb-d" name="doc_date" type="date" className="input" /></div>
                </div>
                <div><label className="label" htmlFor="lb-t">Judul</label><input id="lb-t" name="title" required className="input" /></div>
                <div><label className="label" htmlFor="lb-p">Pihak</label><input id="lb-p" name="parties" className="input" /></div>
                <div><label className="label" htmlFor="lb-c">Inti</label><textarea id="lb-c" name="core" rows={2} className="input" /></div>
                <div><label className="label" htmlFor="lb-kp">Poin kunci / pelajaran</label><textarea id="lb-kp" name="key_points" rows={3} className="input" /></div>
                <div><label className="label" htmlFor="lb-f">Link file (Google Drive)</label><input id="lb-f" name="file_url" type="url" className="input" /></div>
              </div>
            </ActionDialog>
          )}
        </div>
        {rows.map((l) => (
          <article key={l.id} id={l.code} className="card scroll-mt-24 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-[5px] bg-ink px-1.5 py-px font-mono text-[10.5px] font-semibold text-white">{l.kind}</span>
              <span className="font-mono text-[11.5px] text-ink-3">{l.code}</span>
              {l.is_demo && <DemoBadge />}
              <span className="ml-auto text-[12px] text-ink-3">{l.doc_date ? formatDate(l.doc_date) : ""}</span>
            </div>
            <h3 className="mt-2 text-[14.5px] font-bold">{l.title}</h3>
            <p className="text-[12.5px] text-ink-3">{l.parties}</p>
            {l.core && <p className="mt-2 text-[13px]">{l.core}</p>}
            {l.key_points && <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-[12.5px] text-ink-2"><b>Poin kunci:</b> {l.key_points}</p>}
            {l.file_url && <a href={l.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold">Buka file <ExternalLink size={12} /></a>}
          </article>
        ))}
        {rows.length === 0 && <p className="card px-5 py-10 text-center text-[13px] text-ink-2">Belum ada dokumen.</p>}
      </section>
      <section className="card self-start p-5 xl:sticky xl:top-6">
        <h2 className="text-[15px] font-extrabold">Konsultasi AI</h2>
        <p className="mt-1 mb-4 text-[12.5px] text-ink-3">Rekomendasi posisi negosiasi dari Library, agreement aktif, acuan biaya perizinan, dan dokumen di Google Drive. Wajib menyitir ID + kutipan.</p>
        <LibraryConsult ai={ready.ok ? null : ready.reason} />
      </section>
    </div>
  );
}
