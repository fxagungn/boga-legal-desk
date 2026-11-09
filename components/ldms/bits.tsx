import Link from "next/link";
import { X, type LucideIcon } from "lucide-react";
import { listNotes } from "@/lib/ldms/permits";
import { formatDateTime } from "@/lib/time";
import { ActionForm, Submit } from "@/components/actions";
import { cx } from "@/components/ui";
import { addNoteAction } from "@/app/permit-actions";

export function Drawer({ closeHref, label, header, children }: { closeHref: string; label: string; header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50">
      <Link href={closeHref} scroll={false} aria-label="Tutup detail" className="absolute inset-0 bg-ink/25" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col bg-surface shadow-[var(--shadow-drawer)]" aria-label={label}>
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">{header}</div>
          <Link href={closeHref} scroll={false} className="btn btn-ghost btn-sm -mr-2 px-2" aria-label="Tutup"><X size={20} /></Link>
        </header>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2.5 text-[11.5px] font-bold tracking-[0.7px] text-ink-3 uppercase">{children}</h3>;
}

export function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold">{children || "—"}</div>
    </div>
  );
}

export function Banner({ tone, icon: Icon, children }: { tone: "bad" | "warn" | "info" | "ok"; icon?: LucideIcon; children: React.ReactNode }) {
  const t = { bad: "border-brand-line bg-brand-subtle text-brand-deep", warn: "border-warn/20 bg-warn-bg text-warn", info: "border-info/20 bg-info-bg text-info", ok: "border-ok/20 bg-ok-bg text-ok" }[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed", t)}>
      {Icon && <Icon size={17} className="mt-0.5 shrink-0" />}<div className="min-w-0">{children}</div>
    </div>
  );
}

export function MonoChip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cx("inline-block rounded-md px-2 py-[3px] font-mono text-[11px] font-semibold whitespace-nowrap", cls)}>{children}</span>;
}

export function DemoBadge() {
  return <span className="rounded-[5px] bg-info-bg px-1.5 py-px text-[10.5px] font-bold text-info">CONTOH</span>;
}

/** Notes with author + timestamp (blueprint §5.5 / §6.4). */
export async function NotesSection({ entity, id, editable, placeholder, title = "Catatan" }: { entity: "permit" | "agreement"; id: number; editable: boolean; placeholder: string; title?: string }) {
  const notes = await listNotes(entity, id);
  return (
    <section>
      <SectionTitle>{title} {notes.length ? <span className="ml-1 rounded-full bg-mute-bg px-1.5 py-0.5 text-[11px] text-ink-2">{notes.length}</span> : null}</SectionTitle>
      {editable && (
        <ActionForm action={addNoteAction} resetOnDone className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="entity" value={entity} />
          <label className="sr-only" htmlFor={`note-${entity}-${id}`}>Catatan baru</label>
          <textarea id={`note-${entity}-${id}`} name="body" rows={2} required className="input" placeholder={placeholder} />
          <div className="flex justify-end"><Submit className="btn btn-sm">Tambah catatan</Submit></div>
        </ActionForm>
      )}
      {notes.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-bg px-3.5 py-2.5">
              <p className="text-[13.5px] whitespace-pre-line">{n.body}</p>
              <p className="mt-1 text-[12px] text-ink-3">{n.by_name} · {formatDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      ) : !editable && <p className="text-[13px] text-ink-3">Belum ada catatan.</p>}
    </section>
  );
}

export function Kpi({ label, value, unit, sub, tone, dot }: { label: string; value: React.ReactNode; unit?: string; sub?: string; tone?: string; dot?: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-[0.6px] text-ink-2 uppercase">{dot && <span className={cx("h-2 w-2 rounded-full", dot)} aria-hidden="true" />}{label}</div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className={cx("font-mono text-[28px] leading-none font-semibold tracking-[-1px]", tone ?? "text-ink")}>{value}</span>
        {unit && <span className="text-[12px] font-medium text-ink-3">{unit}</span>}
      </div>
      {sub && <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">{sub}</p>}
    </div>
  );
}
