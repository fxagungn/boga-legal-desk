import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { aiReady } from "@/lib/ai";
import { listMembers } from "@/lib/repo";
import { listUnits, shortName } from "@/lib/ldms/permits";
import { INSPECTION_RESULTS, listInspections, RESULT_CHIP, type InspectionRow } from "@/lib/ldms/history";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog } from "@/components/actions";
import { DemoBadge, Drawer, Fact, SectionTitle } from "@/components/ldms/bits";
import { InspectionPrep } from "@/components/ldms/Advice";
import { saveInspectionAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ d?: string; ai?: string; q?: string }> }) {
  const { me, can } = await pageGuard("inspection");
  const sp = await searchParams;
  const [all, units, members, ready] = await Promise.all([listInspections(), listUnits(), listMembers(true), aiReady()]);
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((i) => !q || [i.code, i.agency, i.kind, i.unit_name, i.findings, i.result].filter(Boolean).join(" ").toLowerCase().includes(q));
  const sel = sp.d ? all.find((i) => i.code === sp.d) ?? null : null;
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, ai: sp.ai, ...patch })) if (v) p.set(k, v);
    return `/pemeriksaan${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-2 p-3.5">
        <form method="get" className="flex min-w-[200px] flex-1 gap-2">
          <label className="sr-only" htmlFor="iq">Cari</label>
          <input id="iq" name="q" defaultValue={sp.q} placeholder="Cari instansi, outlet, temuan…" className="input h-9 flex-1" />
          <button className="btn btn-sm h-9">Cari</button>
        </form>
        <Link href={href({ ai: sp.ai ? undefined : "1", d: undefined })} scroll={false} className={cx("btn", sp.ai && "border-brand-line bg-brand-subtle text-brand")}><Sparkles size={15} /> Siapkan pemeriksaan</Link>
        {can("inspection", "edit") && (
          <ActionDialog action={saveInspectionAction} id={0} wide trigger={<><Plus size={16} /> Catat</>} triggerClass="btn btn-primary" title="Catat pemeriksaan" submit="Simpan">
            <InspectionFields units={units} members={members} meId={me.id} />
          </ActionDialog>
        )}
      </section>

      {sp.ai && (
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-extrabold">Siapkan pemeriksaan (AI)</h2>
          <InspectionPrep ai={ready.ok ? null : ready.reason} units={units.map((u) => ({ id: u.id, name: u.name }))} />
        </section>
      )}

      {rows.length === 0 ? <p className="card px-5 py-10 text-center text-[13px] text-ink-2">Belum ada pemeriksaan.</p> : (
        <ul className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((i) => (
            <li key={i.id}>
              <Link href={href({ d: i.code })} scroll={false} className={cx("flex items-center gap-3 px-5 py-3 hover:bg-[#fafbfc] hover:no-underline", sel?.id === i.id && "bg-brand-subtle")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink">{i.agency}</div>
                  <div className="truncate text-[12px] text-ink-3">{formatDate(i.insp_date)} · {i.unit_name ?? "—"}</div>
                </div>
                {i.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
                <span className={cx("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold", RESULT_CHIP[i.result])}>{i.result}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sel && (
        <Drawer closeHref={href({ d: undefined })} label={`Detail ${sel.code}`} header={
          <>
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-semibold text-ink-3">{sel.code}</span><span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", RESULT_CHIP[sel.result])}>{sel.result}</span>{sel.is_demo && <DemoBadge />}</div>
            <h2 className="mt-1 text-[19px] leading-snug font-bold">{sel.agency}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{[sel.kind, sel.unit_name, formatDate(sel.insp_date)].filter(Boolean).join(" · ")}</p>
          </>
        }>
          <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-4">
            <Fact label="PIC Legal">{shortName(sel.pic_name)}</Fact>
            <Fact label="Denda">{sel.fine ? money(Number(sel.fine)) : null}</Fact>
            <Fact label="Ditutup">{sel.closed_at ? formatDate(sel.closed_at) : null}</Fact>
            <Fact label="Perkiraan berikutnya">{sel.next_expected ? formatDate(sel.next_expected) : null}</Fact>
          </section>
          {sel.findings && <section><SectionTitle>Temuan</SectionTitle><p className="text-[13.5px] leading-relaxed">{sel.findings}</p></section>}
          {sel.follow_up && <section><SectionTitle>Tindak lanjut</SectionTitle><p className="text-[13.5px] leading-relaxed">{sel.follow_up}</p></section>}
          {sel.consequence && <section><SectionTitle>Konsekuensi</SectionTitle><p className="text-[13.5px] leading-relaxed">{sel.consequence}</p></section>}
          {can("inspection", "edit") && (
            <div className="flex justify-end">
              <ActionDialog action={saveInspectionAction} id={sel.id} wide trigger="Ubah" triggerClass="btn btn-sm" title={`Ubah ${sel.code}`} submit="Simpan">
                <InspectionFields i={sel} units={units} members={members} meId={me.id} />
              </ActionDialog>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}

function InspectionFields({ i, units, members, meId }: { i?: InspectionRow; units: { id: number; name: string }[]; members: { id: number; name: string }[]; meId: number }) {
  const k = i?.id ?? 0;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`in-d${k}`}>Tanggal</label><input id={`in-d${k}`} name="insp_date" type="date" required defaultValue={i?.insp_date} className="input" /></div>
        <div><label className="label" htmlFor={`in-r${k}`}>Hasil</label><select id={`in-r${k}`} name="result" defaultValue={i?.result} className="input">{INSPECTION_RESULTS.map((r) => <option key={r}>{r}</option>)}</select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`in-a${k}`}>Instansi</label><input id={`in-a${k}`} name="agency" required defaultValue={i?.agency} className="input" /></div>
        <div><label className="label" htmlFor={`in-k${k}`}>Jenis pemeriksaan</label><input id={`in-k${k}`} name="kind" defaultValue={i?.kind ?? ""} className="input" /></div>
      </div>
      <div><label className="label" htmlFor={`in-u${k}`}>Outlet / unit</label><select id={`in-u${k}`} name="unit_id" defaultValue={i?.unit_id ?? ""} className="input">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div><label className="label" htmlFor={`in-f${k}`}>Temuan</label><textarea id={`in-f${k}`} name="findings" rows={2} defaultValue={i?.findings ?? ""} className="input" /></div>
      <div><label className="label" htmlFor={`in-t${k}`}>Tindak lanjut</label><textarea id={`in-t${k}`} name="follow_up" rows={2} defaultValue={i?.follow_up ?? ""} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`in-c${k}`}>Konsekuensi</label><input id={`in-c${k}`} name="consequence" defaultValue={i?.consequence ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`in-fi${k}`}>Denda (Rp)</label><input id={`in-fi${k}`} name="fine" inputMode="numeric" defaultValue={i?.fine ? Number(i.fine).toLocaleString("id-ID") : ""} className="input" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor={`in-p${k}`}>PIC Legal</label><select id={`in-p${k}`} name="pic_id" defaultValue={members.find((m) => m.name === i?.pic_name)?.id ?? meId} className="input">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><label className="label" htmlFor={`in-cl${k}`}>Ditutup</label><input id={`in-cl${k}`} name="closed_at" type="date" defaultValue={i?.closed_at ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`in-n${k}`}>Berikutnya</label><input id={`in-n${k}`} name="next_expected" type="date" defaultValue={i?.next_expected ?? ""} className="input" /></div>
      </div>
    </div>
  );
}
