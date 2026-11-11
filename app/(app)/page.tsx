import Link from "next/link";
import { redirect } from "next/navigation";
import { daysText, inWindow, listPermits, needsAck, RENEWAL_LABEL, TIME_CHIP, timeStatus, type PermitRow } from "@/lib/ldms/permits";
import { listCases } from "@/lib/ldms/cases";
import { can, getAccessCtx, isSuperAdmin } from "@/lib/access";
import { currentMember } from "@/lib/repo";
import { NAV_ITEMS } from "@/lib/nav";
import { cx } from "@/components/ui";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

export const dynamic = "force-dynamic";

const urgency = (p: PermitRow) => (needsAck(p) ? -1000 : 0) + (p.days ?? 1e6);
const isOverdue = (p: PermitRow) => p.days !== null && p.days < 0;
const due30 = (p: PermitRow) => p.days !== null && p.days >= 0 && p.days <= 30;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const me = (await currentMember())!;
  const access = await getAccessCtx();
  const canView = (m: Parameters<typeof can>[2]) => can(access, me, m, "view");
  if (!canView("dashboard")) {
    // Not everyone gets the dashboard (e.g. a cohort that only reads the Knowledge Base): open their first module instead.
    const first = NAV_ITEMS.find((i) => i.href !== "/" && (i.superAdmin ? isSuperAdmin(me) : !i.module || canView(i.module)));
    redirect(first?.href ?? "/settings");
  }
  const sp = await searchParams;
  const permitOk = canView("permit");
  const [permits, cases] = await Promise.all([
    permitOk ? listPermits() : Promise.resolve([] as PermitRow[]), canView("cases") ? listCases() : Promise.resolve([]),
  ]);
  const openCases = cases.filter((c) => c.status !== "selesai");

  const overdue = permits.filter(isOverdue);
  const soon = permits.filter(due30);
  const ackNeeded = permits.filter((p) => p.requires_ack);
  const acked = ackNeeded.filter((p) => p.ack_at);
  const compliance = permits.length ? Math.round(((permits.length - overdue.length) / permits.length) * 100) : 100;

  const buckets = [
    { label: "Overdue", t: "overdue", n: overdue.length, fg: "text-brand", bar: "#C41E29" },
    { label: "≤7 hari", t: "d30", n: permits.filter((p) => p.days !== null && p.days >= 0 && p.days <= 7).length, fg: "text-brand-hover", bar: "#E2606A" },
    { label: "8-30 hari", t: "d30", n: permits.filter((p) => p.days !== null && p.days > 7 && p.days <= 30).length, fg: "text-[#8a5a0b]", bar: "#E9A93C" },
    { label: "31-60 hari", t: "", n: permits.filter((p) => p.days !== null && p.days > 30 && p.days <= 60).length, fg: "text-[#6b5c10]", bar: "#D9CE72" },
    { label: "Aman (>60 hari)", t: "", n: permits.filter((p) => p.days === null || p.days > 60).length, fg: "text-[#3f5a4d]", bar: "#BFCCC4" },
  ];
  const maxB = Math.max(1, ...buckets.map((b) => b.n));

  const brands = new Map<string, { total: number; over: number; soon: number }>();
  for (const p of permits) {
    const k = p.brand ?? (p.scope === "central_kitchen" ? "Central Kitchen" : "Korporat");
    const b = brands.get(k) ?? { total: 0, over: 0, soon: 0 };
    b.total++;
    if (isOverdue(p)) b.over++;
    if (due30(p)) b.soon++;
    brands.set(k, b);
  }
  const brandRows = [...brands.entries()]
    .map(([name, b]) => ({ name, ...b, pct: Math.round(((b.total - b.over) / b.total) * 100) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const action = permits.filter((p) => inWindow(p) || needsAck(p)).sort((a, b) => urgency(a) - urgency(b));

  return (
    <div className="space-y-5">
      {sp.denied && <p className="rounded-xl border border-warn/20 bg-warn-bg px-4 py-2.5 text-[13px] text-warn">Anda tidak punya akses ke halaman itu.</p>}
      <GlobalSearch />

      {(permitOk || canView("cases")) && (
        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Ringkasan">
          {permitOk && <>
            <Kpi dot="bg-brand" label="Kedaluwarsa" value={overdue.length} tone="text-brand" href="/perizinan?t=overdue&pic=all" />
            <Kpi dot="bg-[#e9a93c]" label="≤30 hari" value={soon.length} href="/perizinan?t=d30&pic=all" />
            <Kpi dot="bg-ok" label="Compliance" value={`${compliance}%`} href="/perizinan?pic=all" />
          </>}
          {canView("cases") ? <Kpi dot="bg-ink" label="Case aktif" value={openCases.length} tone={openCases.some((c) => c.risk === "Tinggi") ? "text-brand" : undefined} href="/cases" />
            : permitOk && <Kpi dot="bg-ink" label="Somasi di-ack" value={`${acked.length}/${ackNeeded.length}`} href="/perizinan?t=somasi&pic=all" />}
        </section>
      )}

      {permitOk && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Pipeline kedaluwarsa</h2>
            <ul className="mt-4 space-y-3">
              {buckets.map((b) => (
                <li key={b.label}>
                  <Link href={b.t ? `/perizinan?t=${b.t}&pic=all` : "/perizinan?pic=all"} className="grid grid-cols-[92px_1fr_40px] items-center gap-3 hover:no-underline">
                    <span className={cx("font-mono text-[12px] font-semibold leading-tight", b.fg)}>{b.label}</span>
                    <span className="h-[22px] overflow-hidden rounded-md bg-mute-bg"><span className="block h-full rounded-md" style={{ width: `${Math.max(4, Math.round((b.n / maxB) * 100))}%`, background: b.bar }} /></span>
                    <span className="text-right font-mono text-[14px] font-semibold text-ink">{b.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Compliance per brand</h2>
            <ul className="mt-4 space-y-3">
              {brandRows.map((b) => (
                <li key={b.name}>
                  <Link href={`/perizinan?pic=all&brand=${encodeURIComponent(["Central Kitchen", "Korporat"].includes(b.name) ? "—" : b.name)}`} className="group block hover:no-underline">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="font-semibold text-ink group-hover:text-brand">{b.name}</span>
                      <span className={cx("font-mono text-[12px] font-semibold", b.pct >= 95 ? "text-ok" : "text-brand")}>{b.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-mute-bg"><div className={cx("h-full rounded-full", b.pct >= 95 ? "bg-ok" : "bg-brand")} style={{ width: `${b.pct}%` }} /></div>
                  </Link>
                </li>
              ))}
              {brandRows.length === 0 && <li className="text-[13px] text-ink-3">Registry masih kosong.</li>}
            </ul>
          </section>
        </div>
      )}

      {permitOk && action.length > 0 && (
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-5 py-3.5">
            <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Butuh tindakan</h2>
            <Link href="/perizinan?t=aksi&pic=all" className="text-[13px] font-semibold">Lihat semua ({action.length})</Link>
          </header>
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {action.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link href={`/perizinan?pic=all&d=${p.code}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#fafbfc] hover:no-underline">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-ink">{p.type_name}</div>
                    <div className="truncate text-[12px] text-ink-3">{p.unit_name} · {needsAck(p) ? "Somasi belum ack" : RENEWAL_LABEL[p.renewal_status]}</div>
                  </div>
                  <span className={cx("inline-block shrink-0 rounded-md px-2 py-[3px] font-mono text-[11px] font-semibold whitespace-nowrap", TIME_CHIP[timeStatus(p.days)])}>{daysText(p.days)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Kpi({ dot, label, value, tone, href }: { dot: string; label: string; value: React.ReactNode; tone?: string; href: string }) {
  return (
    <Link href={href} className="card block p-4 transition-colors hover:border-ink-3 hover:no-underline md:p-5">
      <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-[0.6px] text-ink-2 uppercase"><span className={cx("h-2 w-2 rounded-full", dot)} aria-hidden="true" />{label}</div>
      <div className={cx("mt-2 font-mono text-[28px] leading-none font-semibold tracking-[-1px]", tone ?? "text-ink")}>{value}</div>
    </Link>
  );
}
