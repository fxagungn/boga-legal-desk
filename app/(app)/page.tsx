import Link from "next/link";
import { daysText, inWindow, listPermits, needsAck, RENEWAL_LABEL, shortName, TIME_CHIP, timeStatus, type PermitRow } from "@/lib/ldms/permits";
import { searchRows } from "@/lib/ldms/search";
import { getFlows } from "@/lib/flows";
import { query } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/time";
import { cx } from "@/components/ui";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

export const dynamic = "force-dynamic";

const urgency = (p: PermitRow) => (needsAck(p) ? -1000 : 0) + (p.days ?? 1e6);
const isOverdue = (p: PermitRow) => p.days !== null && p.days < 0;
const due30 = (p: PermitRow) => p.days !== null && p.days >= 0 && p.days <= 30;

export default async function Dashboard() {
  const [permits, search, flows, recent] = await Promise.all([
    listPermits(), searchRows(), getFlows(),
    query<{ id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string | null; detail: string | null }>(`select id, at, actor, action, entity, entity_id, detail from audit_log order by at desc limit 10`),
  ]);

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
      <GlobalSearch rows={search} />

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan">
        <Kpi dot="bg-brand" label="Sudah kedaluwarsa" value={overdue.length} unit="dokumen" tone="text-brand" href="/perizinan?t=overdue&pic=all">Segera proses renewal; eskalasi ke Legal Manager & Head of Legal</Kpi>
        <Kpi dot="bg-[#e9a93c]" label="Jatuh tempo ≤30 hari" value={soon.length} unit="dokumen" href="/perizinan?t=d30&pic=all">Ambang renewal berbeda per jenis izin</Kpi>
        <Kpi dot="bg-ok" label="Compliance score" value={compliance} unit="%" href="/perizinan?pic=all">Dokumen berlaku dibagi total registry</Kpi>
        <Kpi dot="bg-ink" label="Acknowledge Legal" value={`${acked.length}/${ackNeeded.length}`} unit="dokumen" href="/perizinan?t=somasi&pic=all">Somasi: siapa terima, kapan, via apa</Kpi>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Pipeline Kedaluwarsa</h2>
            <span className="text-[12px] text-ink-3">ambang renewal mengikuti master list per jenis izin</span>
          </div>
          <ul className="mt-4 space-y-3">
            {buckets.map((b) => (
              <li key={b.label}>
                <Link href={b.t ? `/perizinan?t=${b.t}&pic=all` : "/perizinan?pic=all"} className="grid grid-cols-[92px_1fr_40px] items-center gap-3 hover:no-underline">
                  <span className={cx("font-mono text-[12px] font-semibold leading-tight", b.fg)}>{b.label}</span>
                  <span className="h-[26px] overflow-hidden rounded-md bg-mute-bg"><span className="block h-full rounded-md" style={{ width: `${Math.max(4, Math.round((b.n / maxB) * 100))}%`, background: b.bar }} /></span>
                  <span className="text-right font-mono text-[14px] font-semibold text-ink">{b.n}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-5 rounded-[10px] border border-brand-line bg-brand-subtle px-4 py-3 text-[12.5px] leading-relaxed text-brand-deep">
            <b>Eskalasi internal Legal.</b> Ambang pertama mengikuti jenis izin dan hanya ke Legal Officer pemegang dokumen; berikutnya CC Legal Supervisor, lalu Head of Legal; overdue harian sampai izin terbit. Tidak dikirim ke PIC outlet.{" "}
            {flows.reminder.sendEnabled ? <b>Pengiriman email aktif.</b> : <><b>Saat ini pengiriman email belum aktif</b> — lihat antrean di <Link href="/reminder" className="font-semibold underline">Reminder Engine</Link>.</>}
          </p>
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Compliance per Brand</h2>
          <ul className="mt-4 space-y-4">
            {brandRows.map((b) => (
              <li key={b.name}>
                <Link href={`/perizinan?pic=all&brand=${encodeURIComponent(["Central Kitchen", "Korporat"].includes(b.name) ? "—" : b.name)}`} className="group block hover:no-underline">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-bold text-ink group-hover:text-brand">{b.name}</span>
                    <span className={cx("font-mono text-[12px] font-semibold", b.pct >= 95 ? "text-ok" : "text-brand")}>{b.pct}%</span>
                  </div>
                  <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-mute-bg"><div className={cx("h-full rounded-full", b.pct >= 95 ? "bg-ok" : "bg-brand")} style={{ width: `${b.pct}%` }} /></div>
                  <div className="mt-1 text-[11.5px] text-ink-3">{b.over} overdue · {b.soon} jatuh tempo ≤30h · {b.total} dokumen</div>
                </Link>
              </li>
            ))}
            {brandRows.length === 0 && <li className="text-[13px] text-ink-3">Registry masih kosong.</li>}
          </ul>
        </section>
      </div>

      <section className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Butuh Tindakan Hari Ini</h2>
          <Link href="/perizinan?t=aksi&pic=all" className="btn btn-sm">Buka registry</Link>
        </header>
        {action.length === 0 ? (
          <p className="border-t border-line-2 px-5 py-8 text-center text-[13.5px] text-ink-2">Tidak ada izin di masa renewal atau somasi yang menunggu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-y border-line bg-[#fafbfc] text-[11px] font-bold tracking-[0.6px] text-ink-3 uppercase">
                <tr>
                  <th className="px-5 py-2.5 font-bold">Dokumen</th>
                  <th className="px-3 py-2.5 font-bold">Outlet</th>
                  <th className="px-3 py-2.5 font-bold">Expiry</th>
                  <th className="px-3 py-2.5 font-bold">Sisa</th>
                  <th className="px-3 py-2.5 font-bold">Renewal</th>
                  <th className="px-3 py-2.5 font-bold">Ack</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {action.slice(0, 10).map((p) => (
                  <tr key={p.id} className="group relative hover:bg-[#fafbfc]">
                    <td className="px-5 py-3">
                      <Link href={`/perizinan?pic=all&d=${p.code}`} className="font-bold text-ink after:absolute after:inset-0 group-hover:text-brand hover:no-underline">{p.type_name}</Link>
                      <div className="font-mono text-[10.5px] text-ink-3">{p.number ?? p.code}</div>
                    </td>
                    <td className="px-3 py-3">{p.unit_name}</td>
                    <td className="px-3 py-3 font-mono text-[12px] whitespace-nowrap">{p.expiry_date ? formatDate(p.expiry_date) : "—"}</td>
                    <td className="px-3 py-3"><span className={cx("inline-block rounded-md px-2 py-[3px] font-mono text-[11px] font-semibold whitespace-nowrap", TIME_CHIP[timeStatus(p.days)])}>{daysText(p.days)}</span></td>
                    <td className="px-3 py-3 font-semibold">{RENEWAL_LABEL[p.renewal_status]}</td>
                    <td className="px-3 py-3 text-[12px]">
                      {!p.requires_ack ? <span className="text-ink-3">—</span> : p.ack_at ? <span className="font-semibold text-ok">{shortName(p.ack_by)}</span> : <span className="font-semibold text-brand">belum</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Audit trail</h2>
          <Link href="/audit" className="btn btn-sm">Lihat semua</Link>
        </header>
        {recent.length === 0 ? <p className="border-t border-line-2 px-5 py-6 text-center text-[13px] text-ink-2">Belum ada aktivitas.</p> : (
          <ul className="divide-y divide-line-2 border-t border-line-2">
            {recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 px-5 py-2.5 text-[13px]">
                <span className="w-[120px] shrink-0 font-mono text-[11.5px] text-ink-3">{formatDateTime(a.at)}</span>
                <b>{shortName(a.actor)}</b> <span className="text-ink-2">{a.action}</span>
                <span className="font-mono text-[11.5px] text-ink-3">{a.entity}{a.entity_id ? ` ${a.entity_id}` : ""}</span>
                {a.detail && <span className="min-w-0 flex-1 truncate text-ink-2">— {a.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ dot, label, value, unit, tone, href, children }: { dot: string; label: string; value: React.ReactNode; unit: string; tone?: string; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="card block p-5 transition-colors hover:border-ink-3 hover:no-underline">
      <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-[0.6px] text-ink-2 uppercase"><span className={cx("h-2 w-2 rounded-full", dot)} aria-hidden="true" />{label}</div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className={cx("font-mono text-[30px] leading-none font-semibold tracking-[-1px]", tone ?? "text-ink")}>{value}</span>
        <span className="text-[12px] font-medium text-ink-3">{unit}</span>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{children}</p>
    </Link>
  );
}
