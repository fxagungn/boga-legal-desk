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
import { Banner, DemoBadge, Drawer, Fact, Kpi, MonoChip, NotesSection, SectionTitle } from "@/components/ldms/bits";
import { AgreementForm } from "@/components/ldms/AgreementForm";

export const dynamic = "force-dynamic";

function fields(a: AgreementRow): [string, React.ReactNode][] {
  const ccy = a.currency;
  const end: [string, React.ReactNode] = ["Berakhir", a.end_date ? formatDate(a.end_date) : "—"];
  if (a.kind === "MLA") return [["Principal", a.principal], ["Territory", a.territory], ["Tenor", a.tenor], ["Royalty", a.royalty_pct ? `${Number(a.royalty_pct)}% net sales (${ccy})` : "—"], ["Notice renewal", a.notice_days ? `${a.notice_days} hari sebelum berakhir` : "—"], end];
  if (a.kind === "ULA") return [["Lokasi", a.location], ["Kota", a.city], ["MLA induk", a.parent_code], ["Tenor", a.tenor], ["Unit fee", a.unit_fee ? money(Number(a.unit_fee), ccy) : "—"], ["Royalty", a.royalty_pct ? `${Number(a.royalty_pct)}% net sales (${ccy})` : "—"], ["Kurs acuan", a.fx_ref], end];
  if (a.kind === "PKS") return [["Counterparty", a.counterparty], ["Sifat", a.nature], ["Nilai komitmen", a.value ? money(Number(a.value)) : "—"], ["Termination", a.termination_clause], end];
  return [["Lessor", a.counterparty], ["Skema", a.scheme], ["Sewa / tahun", a.value ? money(Number(a.value)) : "—"], ["Tenor", [a.tenor, a.renewal_option].filter(Boolean).join(" · ")], end];
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

  return (
    <div className="space-y-5">
      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="MLA aktif" value={active.filter((a) => a.kind === "MLA").length} unit="brand" sub="Satu per brand berprincipal" />
        <Kpi label="ULA aktif" value={active.filter((a) => a.kind === "ULA" && (a.days ?? 0) >= 0).length} unit={`/ ${principalOutlets} outlet`} tone={active.filter((a) => a.kind === "ULA" && (a.days ?? 0) >= 0).length < principalOutlets ? "text-brand" : "text-ok"} sub="Harus sama dengan outlet aktif brand berprincipal" />
        <Kpi label="PKS & PSM" value={active.filter((a) => a.kind === "PKS" || a.kind === "PSM").length} unit="perjanjian" sub="Vendor, pemasok, dan sewa outlet" />
        <Kpi label="Berakhir ≤90 hari" value={ending90} unit="perjanjian" tone={ending90 ? "text-brand" : undefined} sub="Notifikasi ke tim Legal, bukan ke outlet" />
      </section>

      {alerts.length > 0 && (
        <Banner tone="bad" icon={AlertTriangle}>
          <b>Validator perjanjian</b>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{alerts.slice(0, 8).map((x, i) => <li key={i}>{x.text}</li>)}</ul>
        </Banner>
      )}

      <section className="card flex flex-wrap items-center gap-2 p-4">
        <span className="mr-1 text-[11px] font-bold tracking-[0.6px] text-ink-3 uppercase">Jenis perjanjian</span>
        {AGR_KINDS.map((k) => (
          <Link key={k} href={`/perjanjian?tab=${k}`} aria-current={tab === k ? "page" : undefined}
            className={cx("rounded-lg border px-3 py-1.5 text-[13px] font-semibold hover:no-underline", tab === k ? "border-brand-line bg-brand-subtle text-brand-hover" : "border-line text-ink-2 hover:text-ink")}>{AGR_LABEL[k]}</Link>
        ))}
        <form className="ml-auto flex items-center gap-2" method="get">
          <input type="hidden" name="tab" value={tab} />
          <label className="sr-only" htmlFor="agq">Cari</label>
          <input id="agq" name="q" defaultValue={sp.q} placeholder="Cari judul, pihak, lokasi…" className="input h-9 w-56" />
        </form>
        <span className="font-mono text-[12px] text-ink-3">{rows.length} dokumen</span>
        {editable && <AgreementForm kind={tab} members={members} me={me} brands={brands} units={units} mlas={mlas} />}
      </section>

      <p className="rounded-xl border border-brand-line bg-brand-subtle px-4 py-3 text-[13px] leading-relaxed text-brand-deep">{AGR_RULE[tab]}</p>

      {rows.length === 0 ? <p className="card px-5 py-10 text-center text-[13.5px] text-ink-2">Belum ada {AGR_LONG[tab]}.</p> : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => {
            const c = agrChip(a.days);
            const noticeOpen = a.notice_days && a.notice_days_left !== null && a.notice_days_left <= 0 && (a.days ?? 0) >= 0;
            return (
              <Link key={a.id} href={href({ d: a.code })} scroll={false} id={a.code} className="card group flex flex-col p-5 hover:border-ink-3 hover:no-underline">
                <div className="flex items-center gap-2">
                  <span className="rounded-[5px] bg-ink px-1.5 py-px font-mono text-[10.5px] font-semibold text-white">{a.kind}</span>
                  <span className="font-mono text-[11px] text-ink-3">{a.code}</span>
                  {a.is_demo && <DemoBadge />}
                  <span className="ml-auto"><MonoChip cls={c.cls}>{c.text}</MonoChip></span>
                </div>
                <h3 className="mt-3 text-[15px] font-bold text-ink group-hover:text-brand">{a.kind === "MLA" ? a.brand : a.unit_name ?? a.title}</h3>
                <p className="text-[12.5px] text-ink-3">{a.kind === "ULA" ? `Unit License Agreement · ${a.location ?? ""}, ${a.city ?? ""} · nilai dalam ${a.currency}` : `${AGR_LONG[a.kind]} · ${a.counterparty ?? a.principal ?? ""}`}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line-2 pt-3">
                  {fields(a).map(([k, v]) => (
                    <div key={k}><dt className="text-[10px] font-bold tracking-[0.6px] text-ink-3 uppercase">{k}</dt><dd className="text-[12.5px] font-semibold text-ink">{v || "—"}</dd></div>
                  ))}
                </dl>
                {noticeOpen && <p className="mt-3 rounded-lg border border-brand-line bg-brand-subtle px-3 py-2 text-[12px] text-brand-deep">Jendela notice renewal ({a.notice_days} hari) sudah terbuka — keputusan perpanjangan harus diambil sekarang.</p>}
                <p className="mt-auto pt-3 text-[12px] font-semibold text-brand">Klik untuk detail & catatan{a.note_count ? ` · ${a.note_count} catatan` : ""}</p>
              </Link>
            );
          })}
        </section>
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
          <NotesSection entity="agreement" id={sel.id} editable={editable} title="Catatan negosiasi & tindak lanjut" placeholder="Hasil negosiasi, posisi pihak lawan, keputusan perpanjangan…" />
          <section><SectionTitle>Terakhir diubah</SectionTitle><p className="text-[13px] text-ink-2">{sel.updated_by ?? "—"}</p></section>
        </Drawer>
      )}
    </div>
  );
}
