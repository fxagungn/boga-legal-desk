import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { getKV } from "@/lib/db";
import { getFlows } from "@/lib/flows";
import { listKb } from "@/lib/ldms/history";
import { listMatrix } from "@/lib/ldms/discipline";
import { formatDate, formatDateTime } from "@/lib/time";
import { ActionButton, ActionDialog } from "@/components/actions";
import { Banner, DemoBadge } from "@/components/ldms/bits";
import { saveKbCaseAction, syncKbAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { can } = await pageGuard("kb");
  const sp = await searchParams;
  const [all, flows, last, rules] = await Promise.all([listKb(), getFlows(), getKV<{ at: string; cases: number; warnings: string[] }>("kb_sync"), listMatrix()]);
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((k) => !q || [k.code, k.title, k.unit_label, k.matrix_code, k.category, k.summary, k.investigation, k.reasoning].filter(Boolean).join(" ").toLowerCase().includes(q));
  const docUrl = flows.drive.kbDocId ? `https://docs.google.com/document/d/${flows.drive.kbDocId}/edit` : null;
  return (
    <div className="space-y-4">
      <Banner tone="info">KB = <b>riwayat penerapan matrix</b>, bukan sumber tingkat sanksi. Dipakai untuk melihat bagaimana unsur dibuktikan dan sebagai ilustrasi langkah investigasi. Tanpa nama/inisial karyawan.</Banner>
      <section className="card flex flex-wrap items-center gap-2.5 p-4">
        <form method="get" className="flex min-w-[200px] flex-1 gap-2">
          <label className="sr-only" htmlFor="kq">Cari</label>
          <input id="kq" name="q" defaultValue={sp.q} placeholder="Cari case, kode matrix, langkah investigasi…" className="input flex-1" />
        </form>
        <span className="font-mono text-[12px] text-ink-3">{rows.length} case</span>
        <span className="text-[12px] text-ink-3">{last ? `Sinkron Google Docs terakhir ${formatDateTime(last.at)} · ${last.cases} case` : "Belum pernah sinkron dari Google Docs"}</span>
        {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="btn btn-sm">Buka Google Docs <ExternalLink size={13} /></a>}
        {can("kb", "approve") && docUrl && <ActionButton action={syncKbAction} id={0} className="btn btn-sm" pending="Menyinkron…"><RefreshCw size={14} /> Sinkron sekarang</ActionButton>}
        {can("kb", "edit") && (
          <ActionDialog action={saveKbCaseAction} id={0} trigger={<><Plus size={16} /> Tambah case</>} triggerClass="btn btn-primary" title="Tambah case yurisprudensi" desc={docUrl ? "Case juga ditulis ke Google Docs KB (7 heading)." : "Google Docs KB belum disiapkan — case tersimpan di LDMS saja."} submit="Simpan">
            <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
              <div><label className="label" htmlFor="kb-t">Judul case</label><input id="kb-t" name="title" required className="input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="kb-d">Tanggal</label><input id="kb-d" name="case_date" type="date" className="input" /></div>
                <div><label className="label" htmlFor="kb-m">Kode matrix</label><select id="kb-m" name="matrix_code" className="input"><option value="">—</option>{rules.map((r) => <option key={r.code}>{r.code}</option>)}</select></div>
              </div>
              <div><label className="label" htmlFor="kb-u">Unit</label><input id="kb-u" name="unit_label" className="input" /></div>
              <div><label className="label" htmlFor="kb-s">Ringkasan case</label><textarea id="kb-s" name="summary" rows={2} className="input" /></div>
              <div><label className="label" htmlFor="kb-c">Kronologi</label><textarea id="kb-c" name="chronology" rows={2} className="input" /></div>
              <div><label className="label" htmlFor="kb-i">Langkah investigasi</label><textarea id="kb-i" name="investigation" rows={2} className="input" /></div>
              <div><label className="label" htmlFor="kb-l">Lokasi</label><input id="kb-l" name="location" className="input" /></div>
              <div><label className="label" htmlFor="kb-f">Fungsi terlibat & pemutus (jabatan, bukan nama)</label><input id="kb-f" name="functions" className="input" /></div>
              <div><label className="label" htmlFor="kb-x">Sanksi (+ kode & occurrence)</label><input id="kb-x" name="sanction" className="input" /></div>
              <div><label className="label" htmlFor="kb-p">Pertimbangan</label><textarea id="kb-p" name="reasoning" rows={2} className="input" /></div>
            </div>
          </ActionDialog>
        )}
      </section>
      {last?.warnings?.length ? <Banner tone="warn"><b>Heading kurang di Google Docs:</b> {last.warnings.slice(0, 5).join(" · ")}</Banner> : null}
      <section className="grid gap-4 lg:grid-cols-2">
        {rows.map((k) => (
          <article key={k.id} id={k.code} className="card scroll-mt-24 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-semibold">{k.code}</span>
              {k.matrix_code && <span className="rounded-[5px] bg-mute-bg px-1.5 py-px font-mono text-[11px] font-semibold">{k.matrix_code}</span>}
              {k.sanction && <span className="rounded-[5px] bg-brand-soft px-1.5 py-px text-[11px] font-bold text-brand">{k.sanction}</span>}
              {k.is_demo && <DemoBadge />}
              <span className="ml-auto text-[12px] text-ink-3">{k.case_date ? formatDate(k.case_date) : ""}{k.source === "docs" ? " · dari Google Docs" : ""}</span>
            </div>
            <h3 className="mt-2 text-[14.5px] font-bold">{k.title}</h3>
            <p className="text-[12.5px] text-ink-3">{[k.unit_label, k.category, k.location].filter(Boolean).join(" · ")}</p>
            {k.summary && <p className="mt-2 text-[13px]">{k.summary}</p>}
            {k.investigation && <div className="mt-3 rounded-lg bg-bg px-3 py-2 text-[12.5px]"><b>Langkah investigasi:</b> {k.investigation}</div>}
            {k.reasoning && <div className="mt-2 rounded-lg bg-bg px-3 py-2 text-[12.5px]"><b>Pertimbangan:</b> {k.reasoning}</div>}
            {k.functions && <p className="mt-2 text-[12px] text-ink-3">{k.functions}{k.decider ? ` · Pemutus: ${k.decider}` : ""}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
