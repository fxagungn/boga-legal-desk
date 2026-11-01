import { CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "./ui";

/** Honest placeholder for an LDMS module that is planned but not built yet. */
export function ComingSoon({ title, sub, phase, points }: { title: string; sub: string; phase: string; points: string[] }) {
  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader title={title} sub={sub} />
      <section className="card p-6">
        <span className="chip bg-warn-bg text-warn"><Clock size={13} /> Sedang dibangun · {phase}</span>
        <h2 className="mt-4 text-[16px] font-bold">Yang akan ada di sini</h2>
        <ul className="mt-3 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-[14.5px] text-ink-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ink-3" />{p}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
