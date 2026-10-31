import Link from "next/link";
import { ArrowUpRight, FileText, Paperclip, Sparkles, X } from "lucide-react";
import { getSettings } from "@/lib/db";
import { buildJourney, needsMe } from "@/lib/journey";
import { getDocument, listAttachments, listEvents, listMembers, type Member } from "@/lib/repo";
import { deadlineText } from "@/lib/labels";
import { fileSize, money } from "@/lib/format";
import { DOC_TYPE_LABEL } from "@/lib/workflow";
import { DocActions } from "./DocActions";
import { HolderLine, JourneyTimeline } from "./journey";
import { cx, PriorityChip, StatusChip } from "./ui";

/** Slide-over preview of one document. Closing = navigating to `closeHref`. */
export async function DocPreview({ id, me, closeHref }: { id: number; me: Member; closeHref: string }) {
  const [doc, settings] = await Promise.all([getDocument(id), getSettings()]);
  if (!doc) return null;
  const [events, files, members] = await Promise.all([listEvents(id), listAttachments(id), listMembers()]);
  const j = buildJourney(doc, [...events].reverse(), members, settings);
  const mine = needsMe(doc, me);
  const pdf = files.find((f) => f.content_type.includes("pdf"));
  const dl = j.ins.daysToDeadline;

  return (
    <div className="fixed inset-0 z-50">
      <Link href={closeHref} scroll={false} aria-label="Tutup pratinjau" className="absolute inset-0 bg-ink/25" />
      <aside className="drawer-panel absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col bg-surface shadow-[var(--shadow-drawer)]" aria-label="Pratinjau dokumen">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-ink-3">
              <span>{doc.code}</span><span>·</span><span>{DOC_TYPE_LABEL[doc.doc_type]}</span>
            </div>
            <h2 className="mt-1 text-[19px] leading-snug font-bold tracking-tight">{doc.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {!j.closed && <PriorityChip level={j.ins.level} />}
              <StatusChip status={doc.status} />
              {!j.closed && <span className={cx("chip", dl !== null && dl < 0 ? "bg-bad-bg text-bad" : "bg-mute-bg text-ink-2")}>{deadlineText(dl)}</span>}
            </div>
          </div>
          <Link href={closeHref} scroll={false} className="btn btn-ghost btn-sm -mr-2 px-2" aria-label="Tutup"><X size={20} /></Link>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className={cx("rounded-xl border p-4", mine ? "border-brand-line bg-brand-subtle" : "border-line bg-bg")}>
            <p className={cx("mb-3 text-[13px] font-bold", mine ? "text-brand" : "text-ink-2")}>{mine ? "Giliran Anda" : j.closed ? "Status" : "Sekarang di meja"}</p>
            {!mine && !j.closed && <div className="mb-3"><HolderLine j={j} /></div>}
            <DocActions doc={doc} j={j} me={me} />
          </section>

          {doc.ai_suggestion && !j.closed && (
            <Link href={`/documents/${doc.id}`} className="flex gap-2 rounded-xl border border-info/20 bg-info-bg px-4 py-3 text-[13.5px] text-info">
              <Sparkles size={16} className="mt-0.5 shrink-0" />
              <span>Ada email baru yang menandakan perubahan langkah. Buka untuk menerapkan.</span>
            </Link>
          )}

          <section>
            <h3 className="mb-1.5 text-[13px] font-bold text-ink-2">Ringkasan</h3>
            <p className="leading-relaxed">{doc.summary || "Belum ada ringkasan."}</p>
            <p className="mt-2 text-[13.5px] text-ink-2">
              {doc.counterparty ?? "Pihak lawan belum diisi"}
              {doc.contract_value !== null && <> · {money(Number(doc.contract_value), doc.currency)}</>}
              {doc.requester_name && <> · diminta {doc.requester_name}</>}
            </p>
            {doc.key_points.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {doc.key_points.map((p, k) => (
                  <li key={k} className="flex gap-2 text-[14px]"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{p}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-bold text-ink-2">Dokumen</h3>
            {pdf ? (
              <div className="overflow-hidden rounded-xl border border-line">
                <iframe src={`/api/attachments/${pdf.id}?view=1#view=FitH&toolbar=0`} title={pdf.filename} className="hidden h-[420px] w-full bg-mute-bg sm:block" />
                <a href={`/api/attachments/${pdf.id}?view=1`} target="_blank" className="flex items-center gap-2 border-t border-line px-3 py-2 text-[13px] font-semibold hover:bg-bg">
                  <FileText size={15} className="text-brand" /> <span className="truncate">{pdf.filename}</span> <ArrowUpRight size={14} className="ml-auto text-ink-3" />
                </a>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[14px] text-ink-2">Belum ada file PDF. Lampiran dari email akan tampil di sini.</p>
            )}
            {files.filter((f) => f.id !== pdf?.id).map((f) => (
              <a key={f.id} href={`/api/attachments/${f.id}`} className="mt-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-bg">
                <Paperclip size={14} className="text-ink-3" /> <span className="truncate">{f.filename}</span> <span className="ml-auto text-[12px] text-ink-3">{fileSize(f.size)}</span>
              </a>
            ))}
          </section>

          <section>
            <h3 className="mb-3 text-[13px] font-bold text-ink-2">Perjalanan</h3>
            <JourneyTimeline j={j} />
          </section>
        </div>

        <footer className="border-t border-line px-5 py-3">
          <Link href={`/documents/${doc.id}`} className="btn w-full">Buka halaman lengkap</Link>
        </footer>
      </aside>
    </div>
  );
}
