import { Check, Clock, Hourglass } from "lucide-react";
import type { Journey, JourneyStep } from "@/lib/journey";
import { days, lateText, leftText } from "@/lib/labels";
import { formatShort, wibDate } from "@/lib/time";
import { cx, Avatar } from "./ui";

function Dot({ s, size = 14 }: { s: JourneyStep; size?: number }) {
  return <span className="grid shrink-0 place-items-center" style={{ width: size + 4, height: size + 4 }}><DotInner s={s} size={size} /></span>;
}

function DotInner({ s, size }: { s: JourneyStep; size: number }) {
  if (s.state === "done")
    return (
      <span className={cx("grid shrink-0 place-items-center rounded-full text-white", s.late ? "bg-brand-deep" : "bg-brand")} style={{ width: size, height: size }}>
        <Check size={size * 0.64} strokeWidth={3.5} />
      </span>
    );
  if (s.state === "current")
    return (
      <span className={cx("relative grid shrink-0 place-items-center rounded-full", s.late ? "bg-brand" : "bg-surface ring-[3px] ring-brand")} style={{ width: size + 4, height: size + 4 }}>
        <span className={cx("rounded-full", s.late ? "bg-white" : "bg-brand")} style={{ width: size * 0.42, height: size * 0.42 }} />
      </span>
    );
  if (s.state === "waiting")
    return <span className="shrink-0 rounded-full bg-surface ring-[3px] ring-warn" style={{ width: size + 4, height: size + 4 }} />;
  return <span className="shrink-0 rounded-full border-2 border-line bg-surface" style={{ width: size, height: size }} />;
}

/** Compact tracker for list rows: dots + where it is now. */
export function MiniJourney({ j }: { j: Journey }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center">
        {j.steps.map((s, i) => (
          <div key={s.key} className="flex items-center" title={`${s.label} — ${s.owner}`}>
            {i > 0 && <span className={cx("h-[2px] w-2.5 sm:w-3.5", s.state === "upcoming" ? "bg-line" : "bg-brand")} />}
            <Dot s={s} size={10} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 truncate text-[12.5px] text-ink-2">
        {j.closed ? (
          j.holder.name
        ) : (
          <>
            Langkah {Math.min(j.doneCount + 1, j.steps.length)} dari {j.steps.length}: <span className="font-semibold text-ink">{j.current?.short}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Full horizontal stepper with owner and timing under each step. */
export function JourneyStepper({ j }: { j: Journey }) {
  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex min-w-max px-1">
        {j.steps.map((s, i) => (
          <li key={s.key} className="relative flex w-[128px] flex-col items-start">
            <div className="flex w-full items-center">
              <Dot s={s} size={16} />
              {i < j.steps.length - 1 && <span className={cx("mx-1.5 h-[2px] flex-1", j.steps[i + 1].state === "upcoming" ? "bg-line" : "bg-brand")} />}
            </div>
            <div className="mt-2 pr-3">
              <div className={cx("text-[13px] leading-tight", s.state === "current" || s.state === "waiting" ? "font-bold" : s.state === "done" ? "font-semibold text-ink-2" : "text-ink-3")}>{s.short}</div>
              <div className="mt-0.5 truncate text-[12px] text-ink-3" title={s.owner}>{s.owner}</div>
              <div className={cx("mt-0.5 text-[12px] tnum", s.late ? "font-semibold text-brand" : "text-ink-3")}>
                {s.state === "done" && s.visits > 0 && days(s.spent)}
                {s.state === "done" && s.visits === 0 && "Selesai"}
                {s.state === "current" && (s.late ? lateText(s.spent - s.target) : leftText(s.target - s.spent))}
                {s.state === "waiting" && <span className="text-warn">Dijeda</span>}
                {s.state === "upcoming" && s.dueAt && `± ${formatShort(wibDate(s.dueAt))}`}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Vertical timeline: who held each step and for how long. */
export function JourneyTimeline({ j }: { j: Journey }) {
  return (
    <ol>
      {j.steps.map((s, i) => {
        const active = s.state === "current" || s.state === "waiting";
        return (
          <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < j.steps.length - 1 && <span className={cx("absolute top-6 left-[9px] bottom-0 w-[2px]", j.steps[i + 1].state === "upcoming" ? "bg-line" : "bg-brand")} />}
            <div className="relative z-[1] mt-0.5 grid w-5 place-items-center"><Dot s={s} size={16} /></div>
            <div className={cx("min-w-0 flex-1 rounded-[10px]", active && "-mx-1 -my-1 bg-brand-subtle px-3 py-2", active && s.state === "waiting" && "bg-warn-bg")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={cx("text-[14px]", active ? "font-bold" : s.state === "upcoming" ? "text-ink-2" : "font-semibold")}>{s.label}</span>
                <span className={cx("text-[12.5px] tnum", s.late ? "font-semibold text-brand" : "text-ink-3")}>
                  {s.state === "done" && (s.visits > 0 ? `${days(s.spent)} · target ${s.target} hari` : "Selesai")}
                  {s.state === "current" && (s.late ? lateText(s.spent - s.target) : leftText(s.target - s.spent))}
                  {s.state === "waiting" && "Jam berhenti sementara"}
                  {s.state === "upcoming" && (s.dueAt ? `Perkiraan ${formatShort(wibDate(s.dueAt))}` : `Target ${s.target} hari`)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2">
                <Avatar name={s.owner} size={18} tone={active ? "brand" : "mute"} />
                <span className="truncate">{s.owner}</span>
                {s.startedAt && s.state !== "upcoming" && <span className="text-ink-3">· mulai {formatShort(s.startedAt)}</span>}
                {s.visits > 1 && <span className="text-ink-3">· {s.visits}× (ada revisi)</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "Sekarang di meja X · 3 hari · Terlambat 1 hari" */
export function HolderLine({ j, compact }: { j: Journey; compact?: boolean }) {
  if (j.closed) return <span className="text-[13px] text-ink-2">{j.holder.name}</span>;
  const ext = j.holder.kind === "external";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={j.holder.kind === "none" ? null : j.holder.name} size={compact ? 26 : 32} tone={j.holder.kind === "none" ? "mute" : ext ? "warn" : j.ins.slaState === "breach" ? "brand" : "ink"} />
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13.5px] font-semibold">{j.holder.name}</div>
        <div className={cx("flex items-center gap-1 text-[12.5px] tnum", ext ? "text-warn" : j.ins.slaState === "breach" ? "font-semibold text-brand" : "text-ink-2")}>
          {ext ? <Hourglass size={12} /> : <Clock size={12} />}
          {ext ? "Menunggu balasan" : j.ins.slaState === "breach" ? lateText(j.overBy) : `${days(j.waiting)} di meja`}
        </div>
      </div>
    </div>
  );
}
