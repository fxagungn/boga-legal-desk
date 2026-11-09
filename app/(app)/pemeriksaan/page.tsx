import { Plus } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { aiReady } from "@/lib/ai";
import { listMembers } from "@/lib/repo";
import { listUnits } from "@/lib/ldms/permits";
import { INSPECTION_RESULTS, listInspections, RESULT_CHIP } from "@/lib/ldms/history";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog } from "@/components/actions";
import { DemoBadge } from "@/components/ldms/bits";
import { InspectionPrep } from "@/components/ldms/Advice";
import { saveInspectionAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { me, can } = await pageGuard("inspection");
  const [rows, units, members, ready] = await Promise.all([listInspections(), listUnits(), listMembers(true), aiReady()]);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,460px)]">
      <section className="space-y-4">
        <header className="card flex flex-wrap items-center gap-3 px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Riwayat pemeriksaan</h2>
          <span className="font-mono text-[12px] text-ink-3">{rows.length} record</span>
          {can("inspection", "edit") && (
            <span className="ml-auto">
              <ActionDialog action={saveInspectionAction} id={0} trigger={<><Plus size={16} /> Catat pemeriksaan</>} triggerClass="btn btn-primary" title="Catat pemeriksaan instansi" submit="Simpan">
                <div className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label" htmlFor="in-d">Tanggal</label><input id="in-d" name="insp_date" type="date" required className="input" /></div>
                    <div><label className="label" htmlFor="in-r">Hasil</label><select id="in-r" name="result" className="input">{INSPECTION_RESULTS.map((r) => <option key={r}>{r}</option>)}</select></div>
                  </div>
                  <div><label className="label" htmlFor="in-a">Instansi</label><input id="in-a" name="agency" required className="input" placeholder="Disnakertrans, Dinas Kesehatan, Satpol PP & Bapenda, BPJPH, Disperindag…" /></div>
                  <div><label className="label" htmlFor="in-k">Jenis pemeriksaan</label><input id="in-k" name="kind" className="input" /></div>
                  <div><label className="label" htmlFor="in-u">Unit</label><select id="in-u" name="unit_id" className="input">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                  <div><label className="label" htmlFor="in-f">Temuan</label><textarea id="in-f" name="findings" rows={2} className="input" /></div>
                  <div><label className="label" htmlFor="in-t">Tindak lanjut</label><textarea id="in-t" name="follow_up" rows={2} className="input" /></div>
                  <div><label className="label" htmlFor="in-c">Konsekuensi</label><input id="in-c" name="consequence" className="input" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label" htmlFor="in-fi">Denda (Rp)</label><input id="in-fi" name="fine" inputMode="numeric" className="input" /></div>
                    <div><label className="label" htmlFor="in-p">PIC Legal</label><select id="in-p" name="pic_id" defaultValue={me.id} className="input">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label" htmlFor="in-cl">Ditutup</label><input id="in-cl" name="closed_at" type="date" className="input" /></div>
                    <div><label className="label" htmlFor="in-n">Perkiraan berikutnya</label><input id="in-n" name="next_expected" type="date" className="input" /></div>
                  </div>
                </div>
              </ActionDialog>
            </span>
          )}
        </header>
        {rows.map((i) => (
          <article key={i.id} id={i.code} className="card scroll-mt-24 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-semibold">{i.code}</span>
              <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", RESULT_CHIP[i.result])}>{i.result}</span>
              {i.is_demo && <DemoBadge />}
              <span className="ml-auto text-[12px] text-ink-3">{formatDate(i.insp_date)}</span>
            </div>
            <h3 className="mt-2 text-[14.5px] font-bold">{i.agency}{i.kind ? ` — ${i.kind}` : ""}</h3>
            <p className="text-[12.5px] text-ink-3">{i.unit_name ?? "-"} · PIC {i.pic_name ?? "-"}{i.next_expected ? ` · perkiraan berikutnya ${formatDate(i.next_expected)}` : ""}</p>
            <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
              <div><dt className="text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">Temuan</dt><dd>{i.findings ?? "—"}</dd></div>
              <div><dt className="text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">Tindak lanjut</dt><dd>{i.follow_up ?? "—"}</dd></div>
              <div><dt className="text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">Konsekuensi</dt><dd>{i.consequence ?? "—"}{i.fine ? ` · ${money(Number(i.fine))}` : ""}</dd></div>
            </dl>
          </article>
        ))}
      </section>
      <section className="card self-start p-5 xl:sticky xl:top-6">
        <h2 className="text-[15px] font-extrabold">Siapkan pemeriksaan</h2>
        <p className="mt-1 mb-4 text-[12.5px] text-ink-3">Rekomendasi dari riwayat pemeriksaan terekam + status perizinan unit saat ini. Temuan berulang diprioritaskan.</p>
        <InspectionPrep ai={ready.ok ? null : ready.reason} units={units.map((u) => ({ id: u.id, name: u.name }))} />
      </section>
    </div>
  );
}
