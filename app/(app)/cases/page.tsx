import Link from "next/link";
import { BookOpen, ExternalLink, Plus } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { listMembers } from "@/lib/repo";
import { listUnits, shortName } from "@/lib/ldms/permits";
import {
  CASE_STATUS, DOC_KINDS, getCaseConfig, listCaseDocs, listCases, listSteps, RISK_CHIP, STAGES, STATUS_CHIP, type CaseConfig, type CaseRow,
} from "@/lib/ldms/cases";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionButton, ActionDialog, ActionForm, Submit } from "@/components/actions";
import { DemoBadge, Drawer, Fact, SectionTitle } from "@/components/ldms/bits";
import { addCaseDocAction, addCaseStepAction, closeCaseAction, reopenCaseAction, saveCaseAction } from "@/app/case-actions";

export const dynamic = "force-dynamic";

type SP = { s?: string; cat?: string; q?: string; d?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const { me, can } = await pageGuard("cases");
  const sp = await searchParams;
  const [all, cfg, units, members] = await Promise.all([listCases(), getCaseConfig(), listUnits(), listMembers(true)]);
  const q = (sp.q ?? "").toLowerCase();
  const s = sp.s ?? "aktif";
  const base = all.filter((c) => (!sp.cat || c.category === sp.cat) && (!q || [c.code, c.title, c.unit_name, c.counterparty, c.chronology, c.root_cause, c.forum].filter(Boolean).join(" ").toLowerCase().includes(q)));
  const rows = base.filter((c) => s === "semua" || (s === "selesai" ? c.status === "selesai" : c.status !== "selesai"));
  const sel = sp.d ? all.find((c) => c.code.toUpperCase() === sp.d!.toUpperCase()) ?? null : null;
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/cases${p.size ? `?${p}` : ""}`;
  };
  const editable = can("cases", "edit");
  const pills = [["aktif", "Aktif", base.filter((c) => c.status !== "selesai").length], ["selesai", "Selesai", base.filter((c) => c.status === "selesai").length], ["semua", "Semua", base.length]] as const;

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center gap-2 p-3.5">
        {pills.map(([k, l, n]) => (
          <Link key={k} href={href({ s: k, d: undefined })} scroll={false} aria-current={s === k ? "true" : undefined}
            className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold hover:no-underline", s === k ? "border-brand-line bg-brand-subtle text-brand-hover" : "border-line text-ink-2 hover:text-ink")}>
            {l} <span className="font-mono text-[11px] text-ink-3">{n}</span>
          </Link>
        ))}
        <form method="get" className="flex min-w-[220px] flex-1 flex-wrap gap-2">
          <input type="hidden" name="s" value={s} />
          <label className="sr-only" htmlFor="cq">Cari</label>
          <input id="cq" name="q" defaultValue={sp.q} placeholder="Cari case…" className="input h-9 min-w-[160px] flex-1" />
          <label className="sr-only" htmlFor="cc">Kategori</label>
          <select id="cc" name="cat" defaultValue={sp.cat ?? ""} className="input h-9 w-auto"><option value="">Semua kategori</option>{cfg.categories.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn btn-sm h-9">Cari</button>
        </form>
        {editable && (
          <ActionDialog action={saveCaseAction} id={0} wide trigger={<><Plus size={16} /> Case baru</>} triggerClass="btn btn-primary" title="Catat case baru" submit="Simpan">
            <CaseFields cfg={cfg} units={units} members={members} meId={me.id} />
          </ActionDialog>
        )}
      </section>

      {rows.length === 0 ? <p className="card px-5 py-10 text-center text-[13.5px] text-ink-2">Belum ada case.</p> : (
        <ul className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={href({ d: c.code })} scroll={false} className={cx("flex items-center gap-3 px-4 py-3 hover:bg-[#fafbfc] hover:no-underline md:px-5", sel?.id === c.id && "bg-brand-subtle")}>
                <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", c.risk === "Tinggi" ? "bg-brand" : c.risk === "Sedang" ? "bg-[#e9a93c]" : "bg-[#bfccc4]")} title={`Risiko ${c.risk}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-ink">{c.title}</div>
                  <div className="truncate text-[12px] text-ink-3">{c.category} · {c.unit_name ?? "—"}</div>
                </div>
                {c.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
                <span className={cx("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold", STATUS_CHIP[c.status])}>{CASE_STATUS[c.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sel && <CaseDrawer c={sel} cfg={cfg} closeHref={href({ d: undefined })} editable={editable} approver={can("cases", "approve")} units={units} members={members} meId={me.id} />}
    </div>
  );
}

function CaseFields({ c, cfg, units, members, meId }: { c?: CaseRow; cfg: CaseConfig; units: { id: number; name: string }[]; members: { id: number; name: string }[]; meId: number }) {
  const k = c?.id ?? 0;
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`cs-c${k}`}>Kategori</label><select id={`cs-c${k}`} name="category" defaultValue={c?.category} className="input">{cfg.categories.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor={`cs-u${k}`}>Outlet / unit</label><select id={`cs-u${k}`} name="unit_id" defaultValue={c?.unit_id ?? ""} className="input"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor={`cs-t${k}`}>Judul</label><input id={`cs-t${k}`} name="title" required defaultValue={c?.title} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor={`cs-i${k}`}>Tgl kejadian</label><input id={`cs-i${k}`} name="incident_date" type="date" defaultValue={c?.incident_date ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`cs-r${k}`}>Tgl dilaporkan</label><input id={`cs-r${k}`} name="reported_date" type="date" defaultValue={c?.reported_date ?? ""} className="input" /></div>
        <div><label className="label" htmlFor={`cs-k${k}`}>Risiko</label><select id={`cs-k${k}`} name="risk" defaultValue={c?.risk ?? "Sedang"} className="input">{["Rendah", "Sedang", "Tinggi"].map((x) => <option key={x}>{x}</option>)}</select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`cs-p${k}`}>Pelapor (fungsi)</label><input id={`cs-p${k}`} name="reporter" defaultValue={c?.reporter ?? ""} placeholder="mis. Outlet Manager, Finance" className="input" /></div>
        <div><label className="label" htmlFor={`cs-cp${k}`}>Pihak lawan</label><input id={`cs-cp${k}`} name="counterparty" defaultValue={c?.counterparty ?? ""} className="input" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`cs-f${k}`}>Forum</label><select id={`cs-f${k}`} name="forum" defaultValue={c?.forum ?? ""} className="input"><option value="">—</option>{cfg.forums.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor={`cs-e${k}`}>Nilai eksposur (Rp)</label><input id={`cs-e${k}`} name="exposure" inputMode="numeric" defaultValue={c?.exposure ? Number(c.exposure).toLocaleString("id-ID") : ""} className="input" /></div>
      </div>
      <div><label className="label" htmlFor={`cs-ch${k}`}>Kronologi</label><textarea id={`cs-ch${k}`} name="chronology" rows={3} defaultValue={c?.chronology ?? ""} className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
        <div><label className="label" htmlFor={`cs-rc${k}`}>Root cause</label><select id={`cs-rc${k}`} name="root_cause_cat" defaultValue={c?.root_cause_cat ?? ""} className="input"><option value="">Belum diketahui</option>{cfg.rootCauses.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor={`cs-rd${k}`}>Penjelasan root cause</label><input id={`cs-rd${k}`} name="root_cause" defaultValue={c?.root_cause ?? ""} className="input" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`cs-pic${k}`}>PIC Legal</label><select id={`cs-pic${k}`} name="pic_id" defaultValue={c?.pic_id ?? meId} className="input">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div><label className="label" htmlFor={`cs-ec${k}`}>Kuasa hukum eksternal</label><input id={`cs-ec${k}`} name="external_counsel" defaultValue={c?.external_counsel ?? ""} className="input" /></div>
      </div>
      {c && c.status !== "selesai" && (
        <div><label className="label" htmlFor={`cs-st${k}`}>Status</label><select id={`cs-st${k}`} name="status" defaultValue={c.status} className="input">{(["baru", "investigasi", "proses"] as const).map((x) => <option key={x} value={x}>{CASE_STATUS[x]}</option>)}</select></div>
      )}
    </div>
  );
}

async function CaseDrawer({ c, cfg, closeHref, editable, approver, units, members, meId }: {
  c: CaseRow; cfg: CaseConfig; closeHref: string; editable: boolean; approver: boolean; units: { id: number; name: string }[]; members: { id: number; name: string }[]; meId: number;
}) {
  const [steps, docs] = await Promise.all([listSteps(c.id), listCaseDocs(c.id)]);
  const open = c.status !== "selesai";
  return (
    <Drawer closeHref={closeHref} label={`Detail ${c.code}`} header={
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-ink-3">{c.code}</span>
          <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", STATUS_CHIP[c.status])}>{CASE_STATUS[c.status]}</span>
          <span className={cx("rounded-md px-2 py-0.5 text-[11px] font-bold", RISK_CHIP[c.risk])}>Risiko {c.risk}</span>
          {c.is_demo && <DemoBadge />}
        </div>
        <h2 className="mt-1.5 text-[19px] leading-snug font-bold">{c.title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{c.category} · {c.unit_name ?? "—"}</p>
      </>
    }>
      <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-4">
        <Fact label="Forum">{c.forum}</Fact>
        <Fact label="Pihak lawan">{c.counterparty}</Fact>
        <Fact label="Kejadian">{c.incident_date ? formatDate(c.incident_date) : null}</Fact>
        <Fact label="Dilaporkan">{c.reported_date ? `${formatDate(c.reported_date)}${c.reporter ? ` · ${c.reporter}` : ""}` : c.reporter}</Fact>
        <Fact label="PIC Legal">{shortName(c.pic_name)}</Fact>
        <Fact label="Eksposur">{c.exposure ? money(Number(c.exposure)) : null}</Fact>
        {c.external_counsel && <Fact label="Kuasa hukum" wide>{c.external_counsel}</Fact>}
      </section>
      {editable && (
        <div className="-mt-3 flex justify-end">
          <ActionDialog action={saveCaseAction} id={c.id} wide trigger="Ubah data" triggerClass="btn btn-sm" title={`Ubah ${c.code}`} submit="Simpan">
            <CaseFields c={c} cfg={cfg} units={units} members={members} meId={meId} />
          </ActionDialog>
        </div>
      )}

      {c.chronology && <section><SectionTitle>Kronologi</SectionTitle><p className="text-[13.5px] leading-relaxed whitespace-pre-line">{c.chronology}</p></section>}
      <section>
        <SectionTitle>Root cause</SectionTitle>
        {c.root_cause_cat ? <p className="text-[13.5px]"><b>{c.root_cause_cat}</b>{c.root_cause ? ` — ${c.root_cause}` : ""}</p> : <p className="text-[13px] text-ink-3">Belum diketahui.</p>}
      </section>

      <section>
        <SectionTitle>Alur penanganan</SectionTitle>
        <ol className="relative space-y-3 border-l-2 border-line-2 pl-4">
          {steps.map((s) => (
            <li key={s.id} className="relative">
              <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand" aria-hidden="true" />
              <div className="text-[12px] text-ink-3"><span className="font-mono">{formatDate(s.step_date)}</span> · {s.stage}</div>
              <div className="text-[13.5px]"><b>{s.handler}</b> — {s.action}</div>
            </li>
          ))}
        </ol>
        {editable && open && (
          <ActionForm action={addCaseStepAction} resetOnDone success="Alur ditambahkan" className="mt-3 grid gap-2 rounded-xl bg-bg p-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
              <input name="step_date" type="date" aria-label="Tanggal" className="input h-9" />
              <select name="stage" aria-label="Tahap" className="input h-9">{STAGES.filter((x) => x !== "Penutupan").map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <input name="handler" required placeholder="Ditangani oleh (fungsi/jabatan, mis. Legal Manager, Kuasa hukum)" aria-label="Penangan" className="input h-9" />
            <input name="action" required placeholder="Tindakan / hasil" aria-label="Tindakan" className="input h-9" />
            <div className="flex justify-end"><Submit className="btn btn-sm">Tambah ke alur</Submit></div>
          </ActionForm>
        )}
      </section>

      <section>
        <SectionTitle>Berkas (BA, bukti, putusan)</SectionTitle>
        {docs.length === 0 ? <p className="text-[13px] text-ink-3">Belum ada berkas.</p> : (
          <ul className="divide-y divide-line-2 rounded-xl border border-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                <span className="w-[92px] shrink-0 text-[11.5px] font-bold text-ink-3">{d.kind}</span>
                <span className="min-w-0 flex-1 truncate">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold">{d.label} <ExternalLink size={12} /></a> : d.label}</span>
                <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{d.doc_date ? formatDate(d.doc_date) : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <ActionForm action={addCaseDocAction} resetOnDone success="Berkas ditambahkan" className="mt-3 grid gap-2 rounded-xl bg-bg p-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-2 sm:grid-cols-[150px_1fr_130px]">
              <select name="kind" aria-label="Jenis" className="input h-9">{DOC_KINDS.map((x) => <option key={x}>{x}</option>)}</select>
              <input name="label" required placeholder="Nama dokumen" aria-label="Nama dokumen" className="input h-9" />
              <input name="doc_date" type="date" aria-label="Tanggal dokumen" className="input h-9" />
            </div>
            <input name="url" type="url" placeholder="Link Google Drive" aria-label="Link" className="input h-9" />
            <div className="flex justify-end"><Submit className="btn btn-sm">Tambah berkas</Submit></div>
          </ActionForm>
        )}
      </section>

      <section>
        <SectionTitle>Keputusan & hasil</SectionTitle>
        {!open ? (
          <div className="space-y-3 rounded-xl border border-ok/25 bg-ok-bg/40 p-4 text-[13.5px]">
            <div className="grid grid-cols-2 gap-3">
              <Fact label="Hasil">{c.outcome}</Fact>
              <Fact label="Ditutup">{c.closed_at ? `${formatDate(c.closed_at)} · ${c.age_days} hari` : null}</Fact>
              {c.settlement && <Fact label="Nilai penyelesaian">{money(Number(c.settlement))}</Fact>}
            </div>
            <Fact label="Keputusan" wide>{c.decision}</Fact>
            <Fact label="Pelajaran" wide>{c.lesson}</Fact>
            {c.preventive && <Fact label="Tindakan pencegahan" wide>{c.preventive}</Fact>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {c.kb_code && <Link href={`/kb?d=${c.kb_code}`} className="btn btn-sm"><BookOpen size={14} /> {c.kb_code} di Knowledge Base</Link>}
              {approver && <ActionButton action={reopenCaseAction} id={c.id} className="btn btn-ghost btn-sm" success="Case dibuka kembali">Buka kembali</ActionButton>}
            </div>
          </div>
        ) : approver ? (
          <ActionForm action={closeCaseAction} className="grid gap-2.5 rounded-xl bg-bg p-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
              <div><label className="label" htmlFor="cl-o">Hasil akhir</label><select id="cl-o" name="outcome" className="input h-9">{cfg.outcomes.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className="label" htmlFor="cl-d">Tanggal tutup</label><input id="cl-d" name="closed_at" type="date" className="input h-9" /></div>
            </div>
            <div><label className="label" htmlFor="cl-de">Keputusan</label><textarea id="cl-de" name="decision" rows={2} required className="input" /></div>
            <div><label className="label" htmlFor="cl-s">Nilai penyelesaian (Rp, opsional)</label><input id="cl-s" name="settlement" inputMode="numeric" className="input h-9" /></div>
            <div><label className="label" htmlFor="cl-l">Pelajaran untuk Knowledge Base</label><textarea id="cl-l" name="lesson" rows={2} required className="input" /></div>
            <div><label className="label" htmlFor="cl-p">Tindakan pencegahan</label><input id="cl-p" name="preventive" className="input h-9" /></div>
            <div className="flex justify-end"><Submit>Tutup case & terbitkan ke KB</Submit></div>
          </ActionForm>
        ) : <p className="text-[13px] text-ink-3">Masih berjalan.</p>}
      </section>
    </Drawer>
  );
}
