import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { query } from "@/lib/db";
import { listMembers } from "@/lib/repo";
import { listUnits, shortName } from "@/lib/ldms/permits";
import { AGR_KINDS, AGR_LABEL, AGR_LONG, AGR_RULE, agrChip, agreementAlerts, listAgreements, type AgreementRow, type AgrKind } from "@/lib/ldms/agreements";
import { money } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { cx } from "@/components/ui";
import { Banner, DemoBadge, Drawer, Fact, Kpi, MonoChip, NotesSection } from "@/components/ldms/bits";
import { AgreementForm } from "@/components/ldms/AgreementForm";

export const dynamic = "force-dynamic";

function fields(a: AgreementRow): [string, React.ReactNode][] {
  const ccy = a.currency;
  const end: [string, React.ReactNode] = ["Berakhir", a.end_date ? formatDate(a.end_date) : "—"];
  if (a.kind === "MLA") return [["Principal", a.principal], ["Territory", a.territory], ["Tenor", a.tenor], ["Royalty", a.royalty_pct ? `${Number(a.royalty_pct)}% net sales (${ccy})` : "—"], ["Notice renewal", a.notice_days ? `${a.notice_days} hari sebelum berakhir` : "—"], end];
  if (a.kind === "ULA") return [["Lokasi", a.location], ["Kota", a.city], ["MLA induk", a.parent_code], ["Tenor", a.tenor], ["Unit fee", a.unit_fee ? money(Number(a.unit_fee), ccy) : "—"], ["Royalty", a.royalty_pct ? `${Number(a.royalty_pct)}% net sales (${ccy})` : "—"], ["Kurs acuan", a.fx_ref], end];
  if (a.kind === "PKS") return [["Counterparty", a.counterparty], ["Sifat", a.nature], ["Nilai komitmen", a.value ? money(Number(a.value)) : "—"], ["Termination", a.termination_clause], end];
  return [["Counterparty", a.counterparty], end];
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; d?: string; q?: string }> }) {
  const { me, can } = await pageGuard("agreement");
  const sp = await searchParams;
  const all = await listAgreements();
  const sel = sp.d ? all.find((a) => a.code.toUpperCase() === sp.d!.toUpperCase()) ?? null : null;
  const tab = (AGR_KINDS.includes(sp.tab as AgrKind) ? sp.tab : sel?.kind ?? "MLA") as AgrKind;
  const q = (sp.q ?? "").toLowerCase();
  const rows = all.filter((a) => a.kind === tab && (!q || [a.code, a.title, a.counterparty, a.location, a.city, a.brand].filter(Boolean).join(" ").toLowerCase().includes(q)));
  const [alerts, members, units, brands] = await Promise.all([
    agreementAlerts(all), listMembers(true), listUnits(),
    query<{ id: number; name: string; has_principal: boolean }>(`select id, name, has_principal from brands where active order by name`),
  ]);
  const mlas = all.filter((a) => a.kind === "MLA");
  const active = all.filter((a) => a.status === "aktif");
  const ending90 = active.filter((a) => a.days !== null && a.days >= 0 && a.days <= 90).length;
  const principalOutlets = units.filter((u) => u.scope === "outlet" && brands.find((b) => b.name === u.brand)?.has_principal).length;
  const editable = can("agreement", "edit");
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, q: sp.q, ...patch })) if (v) p.set(k, v);
    return `/perjanjian?${p}`;
  };

  const ulaOk = active.filter((a) => a.kind === "ULA" && (a.days ?? 0) >= 0).length;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-3">
        <Kpi label="MLA aktif" value={active.filter((a) => a.kind === "MLA").length} />
        <Kpi label="ULA berlaku" value={ulaOk} unit={`/ ${principalOutlets}`} tone={ulaOk < principalOutlets ? "text-brand" : "text-ok"} />
        <Kpi label="Berakhir ≤90 hari" value={ending90} tone={ending90 ? "text-brand" : undefined} />
      </section>

      {alerts.length > 0 && (
        <details className="group rounded-xl border border-brand-line bg-brand-subtle px-4 py-3 text-[13px] text-brand-deep">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><AlertTriangle size={16} /> {alerts.length} peringatan validator <span className="ml-auto text-[12px] font-normal group-open:hidden">Lihat</span></summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5">{alerts.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
        </details>
      )}

      <section className="card flex flex-wrap items-center gap-2 p-3.5">
        {AGR_KINDS.map((k) => (
          <Link key={k} href={`/perjanjian?tab=${k}`} title={AGR_RULE[k]} aria-current={tab === k ? "page" : undefined}
            className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold hover:no-underline", tab === k ? "border-brand-line bg-brand-subtle text-brand-hover" : "border-line text-ink-2 hover:text-ink")}>
            {AGR_LABEL[k]} <span className="font-mono text-[11px] text-ink-3">{all.filter((a) => a.kind === k).length}</span>
          </Link>
        ))}
        <form className="flex min-w-[180px] flex-1 items-center gap-2" method="get">
          <input type="hidden" name="tab" value={tab} />
          <label className="sr-only" htmlFor="agq">Cari</label>
          <input id="agq" name="q" defaultValue={sp.q} placeholder="Cari…" className="input h-9 flex-1" />
        </form>
        {editable && <AgreementForm kind={tab} members={members} me={me} brands={brands} units={units} mlas={mlas} />}
      </section>

      {rows.length === 0 ? <p className="card px-5 py-10 text-center text-[13.5px] text-ink-2">Belum ada {AGR_LONG[tab]}.</p> : (
        <ul className="card divide-y divide-line-2 overflow-hidden">
          {rows.map((a) => {
            const c = agrChip(a.days);
            return (
              <li key={a.id}>
                <Link href={href({ d: a.code })} scroll={false} id={a.code} className={cx("flex items-center gap-3 px-5 py-3 hover:bg-[#fafbfc] hover:no-underline", sel?.id === a.id && "bg-brand-subtle")}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink">{a.kind === "MLA" ? a.brand : a.kind === "ULA" ? a.unit_name ?? a.title : a.title}</div>
                    <div className="truncate text-[12px] text-ink-3">{a.kind === "PKS" ? a.counterparty : a.principal ?? a.counterparty}</div>
                  </div>
                  {a.is_demo && <span className="hidden sm:inline"><DemoBadge /></span>}
                  <MonoChip cls={c.cls}>{c.text}</MonoChip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {sel && (
        <Drawer closeHref={href({ d: undefined })} label={`Detail ${sel.code}`} header={
          <>
            <div className="font-mono text-[12px] font-semibold text-ink-3">{sel.code} · {AGR_LONG[sel.kind]}{sel.is_demo ? " · data contoh" : ""}</div>
            <h2 className="mt-1 text-[19px] leading-snug font-bold">{sel.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <MonoChip cls={agrChip(sel.days).cls}>{agrChip(sel.days).text}</MonoChip>
              Berakhir <b className="text-ink">{sel.end_date ? formatDate(sel.end_date) : "—"}</b> · PIC {shortName(sel.pic_name)}
            </div>
          </>
        }>
          {alerts.filter((x) => x.code === sel.code).map((x, i) => <Banner key={i} tone="warn" icon={AlertTriangle}>{x.text}</Banner>)}
          <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line p-4">
            {fields(sel).map(([k, v]) => <Fact key={k} label={k}>{v}</Fact>)}
            <Fact label="Status">{sel.status === "aktif" ? "Aktif" : "Berakhir"}</Fact>
            {sel.file_url && <Fact label="File"><a href={sel.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">Buka di Drive <ExternalLink size={13} /></a></Fact>}
          </section>
          {editable && <div className="flex justify-end"><AgreementForm kind={sel.kind} a={sel} members={members} me={me} brands={brands} units={units} mlas={mlas} /></div>}
          <NotesSection entity="agreement" id={sel.id} editable={editable} title="Catatan" placeholder="Hasil negosiasi, keputusan perpanjangan…" />
          {sel.updated_by && <p className="text-[12px] text-ink-3">Terakhir diubah: {sel.updated_by}</p>}
        </Drawer>
      )}
    </div>
  );
}
