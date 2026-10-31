import Link from "next/link";
import { Search } from "lucide-react";
import { getSettings } from "@/lib/db";
import { buildJourney } from "@/lib/journey";
import { currentMember, listDocuments, listEventsFor, listMembers } from "@/lib/repo";
import { typeLabel } from "@/lib/workflow";
import { formatShort } from "@/lib/time";
import { money } from "@/lib/format";
import { HolderLine, MiniJourney } from "@/components/journey";
import { DocPreview } from "@/components/DocPreview";
import { Card, cx, Empty, PageHeader, PriorityChip, StatusChip } from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = { q?: string; type?: string; status?: string; doc?: string };

export default async function Documents({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = (await currentMember())!;
  const [settings, docs, members] = await Promise.all([getSettings(), listDocuments({ includeClosed: true }), listMembers()]);
  const events = await listEventsFor(docs.map((d) => d.id));
  const q = (sp.q ?? "").toLowerCase().trim();
  const status = sp.status ?? "open";
  const rows = docs
    .filter((d) => (status === "open" ? d.status === "active" || d.status === "on_hold" : status === "all" ? true : d.status === status))
    .filter((d) => !sp.type || d.doc_type === sp.type)
    .filter((d) => !q || [d.title, d.code, d.counterparty, d.requester_name, d.assignee_name].some((x) => x?.toLowerCase().includes(q)))
    .map((doc) => ({ doc, j: buildJourney(doc, events.filter((e) => e.document_id === doc.id), members, settings) }))
    .sort((a, b) => (status === "open" ? b.j.ins.score - a.j.ins.score : +new Date(b.doc.created_at) - +new Date(a.doc.created_at)));

  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const n = { q: sp.q, type: sp.type, status: sp.status, ...patch };
    Object.entries(n).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/documents?${s}` : "/documents";
  };
  const statuses = [
    { key: "open", label: "Berjalan" },
    { key: "done", label: "Selesai" },
    { key: "cancelled", label: "Dibatalkan" },
    { key: "all", label: "Semua" },
  ];

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeader title="Semua dokumen" sub="Cari dokumen apa pun, termasuk yang sudah selesai.">
        <Link href="/intake" className="btn btn-primary">Tambah dokumen</Link>
      </PageHeader>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input name="q" defaultValue={sp.q} placeholder="Cari judul, kode, pihak lawan, PIC…" className="input pl-9" />
        </div>
        <select name="type" defaultValue={sp.type ?? ""} className="input w-auto">
          <option value="">Semua jenis</option>
          {settings.workflows.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button className="btn">Cari</button>
      </form>

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {statuses.map((s) => (
          <Link key={s.key} href={link({ status: s.key === "open" ? undefined : s.key, doc: undefined })}
            className={cx("chip h-8 px-3 text-[13px]", status === s.key ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:text-ink")}>
            {s.label}
          </Link>
        ))}
      </div>

      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty title="Tidak ada dokumen yang cocok">Coba kata kunci lain atau ubah filter.</Empty>
        ) : (
          <ul className="divide-y divide-line-2">
            {rows.map(({ doc, j }) => (
              <li key={doc.id}>
                <Link href={link({ doc: String(doc.id) })} scroll={false}
                  className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 transition-colors hover:bg-bg md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px] md:items-center">
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <div className="mb-1 flex items-center gap-2">
                      {j.closed ? <StatusChip status={doc.status} /> : <PriorityChip level={j.ins.level} />}
                      <span className="text-[12px] font-semibold text-ink-3">{doc.code}</span>
                    </div>
                    <div className="truncate text-[15px] font-bold">{doc.title}</div>
                    <div className="truncate text-[13px] text-ink-2">
                      {doc.counterparty ?? typeLabel(settings.workflows, doc.doc_type)}
                      {doc.contract_value !== null && ` · ${money(Number(doc.contract_value), doc.currency)}`}
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-1"><MiniJourney j={j} /></div>
                  <HolderLine j={j} compact />
                  <div className="text-right text-[13px]">
                    <div className={cx("font-semibold", !j.closed && j.ins.daysToDeadline !== null && j.ins.daysToDeadline < 0 && "text-brand")}>{j.ins.deadline ? formatShort(j.ins.deadline) : "—"}</div>
                    <div className="text-[12px] text-ink-3">deadline</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sp.doc && <DocPreview id={Number(sp.doc)} me={me} closeHref={link({ doc: undefined })} />}
    </div>
  );
}
