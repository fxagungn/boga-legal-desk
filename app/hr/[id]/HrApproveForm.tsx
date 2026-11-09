"use client";
import { useState } from "react";
import { ActionForm, Submit, Toaster } from "@/components/actions";
import { cx } from "@/components/ui";
import { approveHrByLinkAction } from "@/app/ldms-actions";

const LEVELS = ["ST", "SP1", "SP2", "SP3 NON PHK", "SP3 PHK"];
const rank = (v: string) => { const t = v.toUpperCase(); if (t.includes("SP3 PHK")) return 4; let b = -1; LEVELS.forEach((l, i) => { if (t.includes(l)) b = Math.max(b, i); }); return b; };
const gap = (std: string, f: string) => !(!std || std === "-") && (std.toUpperCase().includes("ATAU") ? !std.toUpperCase().split("ATAU").some((o) => rank(o.trim()) === rank(f)) : rank(std) !== rank(f));

export function HrApproveForm({ id, t, std, initial }: { id: number; t: string; std: string; initial: string }) {
  const [final, setFinal] = useState(initial);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [done, setDone] = useState(false);
  const dev = decision === "approve" && gap(std, final);
  if (done) return <p className="rounded-lg bg-ok-bg px-3 py-3 text-[13.5px] font-semibold text-ok">Keputusan tersimpan. Terima kasih.</p>;
  return (
    <>
      <ActionForm action={approveHrByLinkAction} onDone={() => setDone(true)} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="t" value={t} />
        <input type="hidden" name="final" value={final} />
        <input type="hidden" name="decision" value={decision} />
        <div>
          <label className="label" htmlFor="hr-name">Nama Anda (HR Business Partner)</label>
          <input id="hr-name" name="hr_name" required minLength={3} className="input" />
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Keputusan">
          {(["approve", "reject"] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={decision === d} onClick={() => setDecision(d)}
              className={cx("btn btn-sm flex-1", decision === d && "border-ink bg-ink text-white hover:bg-ink")}>{d === "approve" ? "Setujui" : "Tolak & kembalikan"}</button>
          ))}
        </div>
        {decision === "approve" && (
          <div role="radiogroup" aria-label="Sanksi final" className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <button key={l} type="button" role="radio" aria-checked={final === l} onClick={() => setFinal(l)}
                className={cx("rounded-lg border px-3 py-1.5 font-mono text-[12px] font-semibold", final === l ? "border-ink bg-ink text-white" : "border-line text-ink-2")}>{l}</button>
            ))}
          </div>
        )}
        {dev && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">Menyimpang dari matrix ({std}) — alasan pembeda wajib.</p>}
        <div>
          <label className="label" htmlFor="hr-reason">{decision === "reject" ? "Alasan pengembalian (wajib)" : `Alasan pembeda ${dev ? "(wajib)" : "(opsional)"}`}</label>
          <textarea id="hr-reason" name="reason" rows={3} required={decision === "reject" || dev} className="input" />
        </div>
        <Submit className="btn btn-primary w-full">{decision === "approve" ? "Approve — HR" : "Kembalikan ke Legal"}</Submit>
      </ActionForm>
      <Toaster />
    </>
  );
}
