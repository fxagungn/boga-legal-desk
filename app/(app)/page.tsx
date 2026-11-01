import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Inbox, ShieldAlert, ShieldCheck } from "lucide-react";
import { query } from "@/lib/db";
import { currentMember } from "@/lib/repo";
import { daysText, inWindow, listPermits, needsAck, RENEWAL_LABEL, shortName, TIME_CHIP, timeStatus, type PermitRow } from "@/lib/ldms/permits";
import { money } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/time";
import { Card, cx, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const urgency = (p: PermitRow) => (needsAck(p) ? -1000 : 0) + (p.days ?? 1e6);

export default async function Beranda() {
  const me = (await currentMember())!;
  const [permits, contracts, recent] = await Promise.all([
    listPermits(),
    query<{ mine: number; open: number }>(
      `select count(*) filter (where assignee_id = $1)::int as mine, count(*)::int as open from documents where status in ('active','on_hold')`, [me.id]),
    query<{ id: number; at: string; actor: string | null; action: string; entity: string; entity_id: string; detail: string | null; code: string | null }>(
      `select a.id, a.at, a.actor, a.action, a.entity, a.entity_id, a.detail, p.code from audit_log a
       left join permits p on a.entity = 'permit' and p.id::text = a.entity_id order by a.at desc limit 8`),
  ]);

  const overdue = permits.filter((p) => p.days !== null && p.days < 0);
  const due30 = permits.filter((p) => p.days !== null && p.days >= 0 && p.days <= 30);
  const somasi = permits.filter(needsAck);
  const compliance = permits.length ? Math.round(((permits.length - overdue.length) / permits.length) * 1000) / 10 : 100;
  const cost30 = due30.reduce((s, p) => s + Number(p.est_cost ?? 0), 0);

  const mine = permits.filter((p) => p.pic_id === me.id && (inWindow(p) || needsAck(p))).sort((a, b) => urgency(a) - urgency(b));
  const team = me.role === "staff" ? [] : permits.filter((p) => p.pic_id !== me.id && ((p.days ?? 1) < 0 || needsAck(p))).sort((a, b) => urgency(a) - urgency(b));

  const brands = new Map<string, { total: number; ok: number }>();
  for (const p of permits) {
    const k = p.brand ?? (p.scope === "central_kitchen" ? "Central Kitchen" : "Korporat");
    const b = brands.get(k) ?? { total: 0, ok: 0 };
    b.total++;
    if (!(p.days !== null && p.days < 0)) b.ok++;
    brands.set(k, b);
  }
  const brandRows = [...brands.entries()].map(([name, b]) => ({ name, ...b, pct: Math.round((b.ok / b.total) * 100) })).sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name));

  const hour = Number(new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 13));
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <div>
        <p className="text-[13.5px] font-semibold text-ink-3">{formatDate(Date.now())}</p>
        <h1 className="mt-0.5 text-[26px] font-bold tracking-tight">{greet}, {shortName(me.name)}</h1>
        <p className="mt-1 text-ink-2">
          {mine.length ? <>Ada <b className="text-ink">{mine.length} izin</b> yang perlu Anda tangani.</> : "Tidak ada izin Anda yang perlu ditangani hari ini."}
          {contracts[0]?.mine ? <> · <Link href="/kontrak?f=mine" className="font-semibold text-brand">{contracts[0].mine} kontrak</Link> di meja Anda.</> : null}
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi href="/perizinan" label="Izin aktif" value={permits.length} icon={ShieldCheck} />
        <Kpi href="/perizinan?t=overdue&pic=all" label="Overdue" value={overdue.length} icon={AlertTriangle} tone={overdue.length ? "bad" : undefined} />
        <Kpi href="/perizinan?t=d30&pic=all" label="Jatuh tempo ≤ 30 hari" value={due30.length} sub={cost30 ? `est. ${money(cost30)}` : undefined} icon={CalendarClock} tone={due30.length ? "warn" : undefined} />
        <Kpi href="/perizinan?t=somasi&pic=all" label="Somasi belum ack" value={somasi.length} icon={ShieldAlert} tone={somasi.length ? "bad" : undefined} />
        <Kpi href="/perizinan?pic=all" label="Compliance" value={`${compliance.toLocaleString("id-ID")}%`} sub="izin tidak kedaluwarsa" icon={ShieldCheck} tone={compliance < 95 ? "warn" : "ok"} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card title="Perlu tindakan Anda" sub="Izin yang sudah masuk masa renewal atau bersomasi, paling mendesak di atas." pad={false}
            action={<Link href="/perizinan?t=aksi&pic=me" className="btn btn-ghost btn-sm">Lihat semua <ArrowRight size={14} /></Link>}>
            {mine.length === 0 ? <Empty title="Semua aman">Tidak ada izin Anda di masa renewal.</Empty> : <PermitList rows={mine.slice(0, 8)} />}
          </Card>
          {team.length > 0 && (
            <Card title="Perlu perhatian tim" sub="Overdue atau somasi belum acknowledge milik PIC lain." pad={false}
              action={<Link href="/perizinan?t=overdue&pic=all" className="btn btn-ghost btn-sm">Registry <ArrowRight size={14} /></Link>}>
              <PermitList rows={team.slice(0, 6)} showPic />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Compliance per brand" sub="% izin yang belum kedaluwarsa">
            <ul className="space-y-3">
              {brandRows.map((b) => (
                <li key={b.name}>
                  <Link href={`/perizinan?pic=all&brand=${encodeURIComponent(["Central Kitchen", "Korporat"].includes(b.name) ? "—" : b.name)}`} className="group block">
                    <div className="flex items-baseline justify-between text-[13.5px]">
                      <span className="font-semibold group-hover:text-brand">{b.name}</span>
                      <span className={cx("tnum font-semibold", b.pct < 95 ? "text-brand" : "text-ink-2")}>{b.pct}% <span className="font-normal text-ink-3">· {b.total}</span></span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mute-bg"><div className={cx("h-full rounded-full", b.pct < 95 ? "bg-brand" : "bg-ok")} style={{ width: `${b.pct}%` }} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Review Kontrak" action={<Inbox size={18} className="text-ink-3" />}>
            <p className="text-[14px] text-ink-2"><b className="text-ink tnum">{contracts[0]?.open ?? 0}</b> kontrak berjalan dari email [LEGAL]{contracts[0]?.mine ? <>, <b className="text-ink">{contracts[0].mine}</b> di meja Anda</> : null}.</p>
            <Link href="/kontrak" className="btn btn-sm mt-3">Buka Review Kontrak</Link>
          </Card>

          <Card title="Aktivitas terakhir" pad={false}>
            {recent.length === 0 ? <Empty title="Belum ada aktivitas" /> : (
              <ul className="divide-y divide-line-2">
                {recent.map((a) => (
                  <li key={a.id} className="px-5 py-2.5 text-[13.5px]">
                    <b>{shortName(a.actor)}</b> {a.action}{" "}
                    {a.code ? <Link href={`/perizinan?pic=all&d=${a.code}`} className="font-mono text-[12.5px] font-semibold text-brand">{a.code}</Link> : null}
                    {a.detail ? <span className="text-ink-2"> — {a.detail.length > 70 ? a.detail.slice(0, 70) + "…" : a.detail}</span> : null}
                    <div className="text-[12px] text-ink-3">{formatDateTime(a.at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ href, label, value, sub, icon: Icon, tone }: { href: string; label: string; value: React.ReactNode; sub?: string; icon: typeof ShieldCheck; tone?: "bad" | "warn" | "ok" }) {
  const t = tone === "bad" ? "text-brand" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink";
  return (
    <Link href={href} className="card group p-4 transition-colors hover:border-ink-3">
      <div className="flex items-center justify-between text-[12.5px] font-semibold text-ink-3">{label}<Icon size={16} /></div>
      <div className={cx("mt-1.5 text-[26px] leading-none font-bold tnum", t)}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-ink-3">{sub}</div>}
    </Link>
  );
}

function PermitList({ rows, showPic }: { rows: PermitRow[]; showPic?: boolean }) {
  return (
    <ul className="divide-y divide-line-2">
      {rows.map((p) => (
        <li key={p.id}>
          <Link href={`/perizinan?pic=all&d=${p.code}`} className="flex items-center gap-3 px-5 py-3 hover:bg-bg">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{p.type_name}</span>
                {needsAck(p) && <span className="chip h-5 shrink-0 bg-brand px-1.5 text-[11px] text-white">Somasi</span>}
              </div>
              <div className="truncate text-[13px] text-ink-2">{p.unit_name} · {RENEWAL_LABEL[p.renewal_status]}{showPic ? ` · ${shortName(p.pic_name)}` : ""}</div>
            </div>
            <span className={cx("chip shrink-0 font-mono", TIME_CHIP[timeStatus(p.days)])}>{daysText(p.days)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
