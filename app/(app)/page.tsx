import Link from "next/link";
import { AlertTriangle, CheckCircle2, Hourglass, Layers } from "lucide-react";
import { getSettings, query } from "@/lib/db";
import { buildJourney, holderLoads, needsMe } from "@/lib/journey";
import { currentMember, listDocuments, listEventsFor, listMembers } from "@/lib/repo";
import { days, deadlineText, firstName } from "@/lib/labels";
import { formatDate, formatShort } from "@/lib/time";
import { typeLabel } from "@/lib/workflow";
import { HolderLine, MiniJourney } from "@/components/journey";
import { DocPreview } from "@/components/DocPreview";
import { Avatar, Card, cx, Empty, Notice, PriorityChip } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = { f?: string; who?: string; doc?: string };

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = (await currentMember())!;
  const [settings, docs, members, doneRow] = await Promise.all([
    getSettings(),
    listDocuments(),
    listMembers(),
    query<{ n: number }>(`select count(*)::int as n from documents where status='done' and completed_at > now() - interval '30 days'`),
  ]);
  const events = await listEventsFor(docs.map((d) => d.id));
  const all = docs
    .map((doc) => ({ doc, j: buildJourney(doc, events.filter((e) => e.document_id === doc.id), members, settings) }))
    .sort((a, b) => b.j.ins.score - a.j.ins.score);

  const mine = all.filter(({ doc }) => needsMe(doc, me, settings));
  const late = all.filter(({ j }) => j.ins.slaState === "breach");
  const waiting = all.filter(({ doc }) => doc.status === "on_hold");
  const loads = holderLoads(all);
  const isDemo = docs.some((d) => d.is_demo);

  const f = sp.f ?? "all";
  let rows = f === "mine" ? mine : f === "late" ? late : f === "waiting" ? waiting : all;
  const whoLoad = sp.who ? loads.find((l) => l.holder.key === sp.who) : undefined;
  if (whoLoad) rows = rows.filter(({ doc }) => whoLoad.docIds.includes(doc.id));

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const next = { f: sp.f, who: sp.who, ...patch };
    if (next.f && next.f !== "all") p.set("f", next.f);
    if (next.who) p.set("who", next.who);
    if (next.doc) p.set("doc", next.doc);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const hour = Number(new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 13));
  const greet = hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  const tabs = [
    { key: "all", label: "Semua", n: all.length },
    { key: "mine", label: "Perlu tindakan saya", n: mine.length },
    { key: "late", label: "Terlambat", n: late.length },
    { key: "waiting", label: "Menunggu pihak luar", n: waiting.length },
  ];

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <div>
        <p className="text-[13.5px] font-semibold text-ink-3">{formatDate(Date.now())}</p>
        <h1 className="mt-0.5 text-[26px] font-bold tracking-tight">{greet}, {firstName(me.name)}</h1>
      </div>

      {isDemo && (
        <Notice tone="warn" action={<Link href="/settings" className="btn btn-sm">Ke pengaturan</Link>}>
          Saat ini berisi <b>data contoh</b> agar tampilan terisi. Hapus di Pengaturan sebelum tim mulai memakai.
        </Notice>
      )}

      {mine.length > 0 ? (
        <Link href={qs({ f: "mine", who: undefined })} scroll={false} className="flex items-center gap-4 rounded-xl border border-brand-line bg-brand-subtle px-5 py-4 transition-colors hover:bg-brand-soft">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-[18px] font-extrabold text-white tnum">{mine.length}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-brand-deep">Dokumen menunggu tindakan Anda</p>
            <p className="truncate text-[13.5px] text-brand-deep/80">{mine.slice(0, 3).map(({ doc }) => doc.title).join(" · ")}</p>
          </div>
          <span className="btn btn-primary btn-sm hidden sm:inline-flex">Lihat</span>
        </Link>
      ) : (
        <Notice tone="ok">Tidak ada dokumen yang menunggu tindakan Anda saat ini.</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sedang berjalan", value: all.length, icon: Layers, tone: "text-ink", href: qs({ f: "all", who: undefined }) },
          { label: "Terlambat", value: late.length, icon: AlertTriangle, tone: late.length ? "text-brand" : "text-ink", href: qs({ f: "late", who: undefined }) },
          { label: "Tunggu pihak luar", value: waiting.length, icon: Hourglass, tone: "text-ink", href: qs({ f: "waiting", who: undefined }) },
          { label: "Selesai 30 hari", value: doneRow[0]?.n ?? 0, icon: CheckCircle2, tone: "text-ok", href: "/documents?status=done" },
        ].map((s) => (
          <Link key={s.label} href={s.href} scroll={false} className="card flex items-center gap-3 px-4 py-3.5 transition-shadow hover:shadow-[var(--shadow-float)]">
            <s.icon size={20} className={cx("shrink-0", s.tone === "text-ink" ? "text-ink-3" : s.tone)} />
            <div className="min-w-0">
              <div className={cx("text-[24px] leading-none font-extrabold tnum", s.tone)}>{s.value}</div>
              <div className="mt-1 truncate text-[12.5px] font-semibold text-ink-2">{s.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <Card title="Di meja siapa sekarang" sub="Klik untuk melihat dokumen yang sedang mereka pegang. Paling atas = paling menghambat." pad={false}>
        {loads.length === 0 ? (
          <Empty title="Belum ada dokumen berjalan" />
        ) : (
          <div className="overflow-hidden rounded-b-[12px]"><div className="-mr-px -mb-px grid sm:grid-cols-2 lg:grid-cols-4">
            {loads.map((l) => {
              const on = sp.who === l.holder.key;
              return (
                <Link
                  key={l.holder.key}
                  href={qs({ who: on ? undefined : l.holder.key })}
                  scroll={false}
                  className={cx("flex items-center gap-3 border-r border-b border-line-2 bg-surface px-5 py-4 transition-colors hover:bg-bg", on && "bg-brand-subtle hover:bg-brand-subtle")}
                >
                  <Avatar name={l.holder.kind === "none" ? null : l.holder.name} size={38} tone={l.holder.kind === "none" ? "mute" : l.holder.kind === "external" ? "warn" : l.late ? "brand" : "ink"} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[14px] font-bold">{l.holder.name}</div>
                    {l.late > 0 && <div className="mt-1 text-[12.5px] font-semibold text-brand tnum">{l.late} terlambat</div>}
                    <div className="mt-0.5 text-[12.5px] text-ink-2 tnum">Terlama {days(l.longest)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] leading-none font-extrabold tnum">{l.count}</div>
                    <div className="text-[11.5px] text-ink-3">dokumen</div>
                  </div>
                </Link>
              );
            })}
          </div></div>
        )}
      </Card>

      <Card
        pad={false}
        title={whoLoad ? `Dokumen di meja ${whoLoad.holder.name}` : "Perjalanan dokumen"}
        sub={whoLoad ? <Link href={qs({ who: undefined })} scroll={false} className="font-semibold text-brand hover:underline">Tampilkan semua orang</Link> : "Diurutkan dari yang paling mendesak."}
      >
        <div className="flex gap-1 overflow-x-auto border-b border-line-2 px-3 pt-2">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={qs({ f: t.key })}
              scroll={false}
              className={cx("-mb-px shrink-0 border-b-2 px-3 pt-1 pb-2.5 text-[13.5px] font-semibold", f === t.key ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink")}
            >
              {t.label} <span className={cx("ml-1 rounded-full px-1.5 text-[12px] tnum", f === t.key ? "bg-brand-soft" : "bg-mute-bg")}>{t.n}</span>
            </Link>
          ))}
        </div>
        {rows.length === 0 ? (
          <Empty title={f === "mine" ? "Tidak ada yang menunggu Anda" : "Tidak ada dokumen di sini"}>
            {all.length === 0 && <>Email bersubjek <b>{settings.subjectKeywords[0]}</b> akan otomatis muncul di sini. Atau <Link href="/intake" className="font-semibold text-brand">tambah dokumen</Link>.</>}
          </Empty>
        ) : (
          <ul className="divide-y divide-line-2">
            {rows.map(({ doc, j }) => (
              <li key={doc.id}>
                <Link
                  href={qs({ doc: String(doc.id) })}
                  scroll={false}
                  className={cx("grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 transition-colors hover:bg-bg md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_120px] md:items-center", sp.doc === String(doc.id) && "bg-brand-subtle")}
                >
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="mb-1 flex items-center gap-2">
                      <PriorityChip level={j.ins.level} />
                      {doc.urgent && <span className="text-[12px] font-bold text-brand">Urgent</span>}
                    </div>
                    <div className="truncate text-[15px] font-bold">{doc.title}</div>
                    <div className="truncate text-[13px] text-ink-2">{doc.counterparty ?? typeLabel(settings.workflows, doc.doc_type)}</div>
                  </div>
                  <div className="col-span-2 md:col-span-1"><MiniJourney j={j} /></div>
                  <HolderLine j={j} compact />
                  <div className="text-right text-[13px] leading-tight">
                    <div title={j.ins.latePrediction ? "Dengan kecepatan sekarang, diperkirakan selesai setelah deadline" : undefined} className={cx("font-semibold", j.ins.daysToDeadline !== null && j.ins.daysToDeadline < 0 ? "text-brand" : j.ins.latePrediction && j.ins.daysToDeadline !== null && j.ins.daysToDeadline <= 7 ? "text-warn" : "")}>
                      {j.ins.deadline ? formatShort(j.ins.deadline) : "—"}
                    </div>
                    <div className="text-[12px] text-ink-3">
                      {j.ins.deadline ? deadlineText(j.ins.daysToDeadline).replace("Deadline ", "") : "tanpa deadline"}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sp.doc && <DocPreview id={Number(sp.doc)} me={me} closeHref={qs({ doc: undefined })} />}
    </div>
  );
}
