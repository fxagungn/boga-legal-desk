import Link from "next/link";
import type { PriorityLevel } from "@/lib/insight";
import { PRIORITY } from "@/lib/labels";
import { initials } from "@/lib/format";
import { STATUS_LABEL, type DocStatus } from "@/lib/workflow";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Logo({ sub = true }: { sub?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" className="h-8 w-8" />
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">Boga Legal Desk</span>
        {sub && <span className="block text-[11px] font-semibold text-ink-3">Dokumen legal, terpantau</span>}
      </span>
    </Link>
  );
}

export function PriorityChip({ level, title }: { level: PriorityLevel; title?: string }) {
  const p = PRIORITY[level];
  return <span title={title ?? p.hint} className={cx("chip", p.className)}>{p.label}</span>;
}

const STATUS_STYLE: Record<DocStatus, string> = {
  active: "bg-info-bg text-info",
  on_hold: "bg-warn-bg text-warn",
  done: "bg-ok-bg text-ok",
  cancelled: "bg-mute-bg text-ink-2",
};
export function StatusChip({ status }: { status: DocStatus }) {
  return <span className={cx("chip", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

export function Avatar({ name, size = 28, tone = "ink" }: { name?: string | null; size?: number; tone?: "ink" | "brand" | "warn" | "mute" }) {
  const t = { ink: "bg-ink text-white", brand: "bg-brand text-white", warn: "bg-warn-bg text-warn ring-1 ring-inset ring-warn/30", mute: "bg-mute-bg text-ink-3" }[tone];
  return (
    <span
      title={name ?? undefined}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-bold", t)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {name ? initials(name) : "?"}
    </span>
  );
}

export function Card({ title, sub, action, children, className, pad = true }: { title?: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("card", className)}>
      {title && (
        <header className="flex items-start justify-between gap-3 border-b border-line-2 px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-bold">{title}</h2>
            {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-ink-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, action }: { tone?: "info" | "warn" | "brand" | "ok"; children: React.ReactNode; action?: React.ReactNode }) {
  const t = { info: "bg-info-bg text-info border-info/15", warn: "bg-warn-bg text-warn border-warn/20", brand: "bg-brand-subtle text-brand-deep border-brand-line", ok: "bg-ok-bg text-ok border-ok/20" }[tone];
  return (
    <div className={cx("flex flex-wrap items-center gap-3 rounded-[10px] border px-4 py-3 text-[14px]", t)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[14px] text-ink-2">{children}</div>}
    </div>
  );
}
