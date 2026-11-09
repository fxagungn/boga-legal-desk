import { CheckCircle2, Sparkles } from "lucide-react";
import { pageGuard } from "@/lib/guard";
import { getFlows } from "@/lib/flows";
import { listUnits } from "@/lib/ldms/permits";
import { defaultFinal, listMatrix, listPunishments, PNS_STATUS, type PunishmentRow } from "@/lib/ldms/discipline";
import { formatDateTime } from "@/lib/time";
import { cx } from "@/components/ui";
import { ActionDialog } from "@/components/actions";
import { DemoBadge } from "@/components/ldms/bits";
import { PunishmentForm } from "@/components/ldms/PunishmentForm";
import { DecisionPanel, HrLinkButton, LetterButton } from "@/components/ldms/DecisionPanel";
import { approveHrInAppAction, approveLegalAction, rejectPunishmentAction } from "@/app/ldms-actions";

export const dynamic = "force-dynamic";

function Stepper({ p }: { p: PunishmentRow }) {
  const steps = [["Diajukan", true], ["Legal", Boolean(p.legal_at)], ["HR", Boolean(p.hr_at)], ["Tercatat", p.status === "done"]] as const;
  return (
    <ol className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-3" aria-label="Tahap approval">
      {steps.map(([l, done], i) => (
        <li key={l} className="flex items-center gap-2">
          <span className={cx("h-2.5 w-2.5 rounded-full", done ? "bg-ok" : "bg-line")} aria-hidden="true" />
          <span className={done ? "text-ink" : undefined}>{l}</span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-line" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

export default async function Page() {
  const { can } = await pageGuard("punishment");
  const [rows, rules, units, flows] = await Promise.all([listPunishments(), listMatrix(), listUnits(), getFlows()]);
  const canApprove = can("punishment", "approve");
  const drive = Boolean(flows.drive.folderId);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_1fr]">
      {can("punishment", "edit") ? (
        <section className="card self-start p-5">
          <h2 className="text-[15px] font-extrabold">Pengajuan Sanksi</h2>
          <p className="mt-1 mb-4 text-[12.5px] leading-relaxed text-ink-3">Diajukan atasan langsung → review Legal → review HR → tercatat sebagai yurisprudensi. Sanksi baku dihitung dari matrix; analisis AI dilampirkan sebagai bahan pertimbangan approver.</p>
          <PunishmentForm rules={rules} units={units.filter((u) => u.scope !== "korporat" || true)} functions={flows.punishment.submitterFunctions} />
        </section>
      ) : <div />}

      <section className="space-y-4">
        <header className="card flex items-center justify-between px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Antrean Approval</h2>
          <span className="font-mono text-[12px] text-ink-3">{rows.filter((r) => r.status === "legal" || r.status === "hr").length} menunggu · {rows.length} pengajuan</span>
        </header>
        {rows.length === 0 && <p className="card border-dashed px-5 py-10 text-center text-[13px] text-ink-2">Belum ada pengajuan.</p>}
        {rows.map((p) => {
          const st = PNS_STATUS[p.status];
          const init = p.final ?? defaultFinal(p.matrix_std, p.proposed);
          return (
            <article key={p.id} id={p.code} className="card scroll-mt-24 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-semibold">{p.code}</span>
                <span className={cx("rounded-md px-2 py-0.5 text-[11.5px] font-bold", st?.cls)}>{st?.label}</span>
                {p.is_demo && <DemoBadge />}
                <span className="ml-auto"><Stepper p={p} /></span>
              </div>
              <h3 className="mt-2 text-[14.5px] font-bold">{p.matrix_code} — {p.sub_category}</h3>
              <p className="text-[12.5px] text-ink-3">{p.unit_name ?? "-"} · Pengaju: {p.submitter_fn} · {p.occurrence} · Banding: {p.appeal} · Authority: {p.authority}</p>
              <p className="mt-2 text-[13px] whitespace-pre-line text-ink-2">{p.description}</p>
              {p.evidence_url && <a href={p.evidence_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12.5px] font-semibold">Lihat bukti</a>}

              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-4">
                {[["Usulan atasan", p.proposed ?? "—"], ["Sanksi baku matrix", p.matrix_std], ["Verifikasi AI", p.ai_level ? `${p.ai_level}${p.ai_code && p.ai_code !== p.matrix_code ? ` (${p.ai_code})` : ""}` : "menunggu…"], ["Final", p.final ?? "—"]].map(([k, v]) => (
                  <div key={k}><dt className="text-[10px] font-bold tracking-[0.6px] text-ink-3 uppercase">{k}</dt><dd className={cx("font-mono text-[13px] font-semibold", k === "Sanksi baku matrix" && "text-brand")}>{v}</dd></div>
                ))}
              </dl>
              {p.ai_reason && <p className="mt-2 flex gap-2 rounded-lg bg-mute-bg px-3 py-2 text-[12.5px] text-ink-2"><Sparkles size={14} className="mt-0.5 shrink-0 text-brand" /><span><b>Catatan AI:</b> {p.ai_reason}</span></p>}

              {p.status === "legal" && canApprove && (
                <div className="mt-4 border-t border-line-2 pt-4">
                  <DecisionPanel id={p.id} std={p.matrix_std} initial={init} proposed={p.proposed} approve={approveLegalAction} label="Approve — Legal" />
                </div>
              )}
              {p.status === "hr" && (
                <div className="mt-4 space-y-3 border-t border-line-2 pt-4">
                  <p className="text-[12.5px] text-ink-2">Disetujui Legal: <b>{p.legal_by}</b> · {p.legal_at ? formatDateTime(p.legal_at) : ""} → <b className="font-mono">{p.final}</b>{p.deviation_reason ? ` · alasan: ${p.deviation_reason}` : ""}</p>
                  {canApprove && <HrLinkButton id={p.id} />}
                  {canApprove && (
                    <details className="text-[13px]">
                      <summary className="cursor-pointer font-semibold">Catat approval HR di sini (atas nama HR)</summary>
                      <div className="mt-3"><DecisionPanel id={p.id} std={p.matrix_std} initial={p.final ?? init} proposed={p.proposed} approve={approveHrInAppAction} label="Approve — HR" dark /></div>
                    </details>
                  )}
                </div>
              )}
              {(p.status === "legal" || p.status === "hr") && canApprove && (
                <div className="mt-3 flex justify-end">
                  <ActionDialog action={rejectPunishmentAction} id={p.id} trigger="Tolak & kembalikan" triggerClass="btn btn-sm btn-danger" title={`Kembalikan ${p.code}`} desc="Pengaju akan melihat alasan ini." submit="Kembalikan" submitClass="btn btn-primary">
                    <label className="label" htmlFor={`rj-${p.id}`}>Alasan</label>
                    <textarea id={`rj-${p.id}`} name="reason" rows={3} required className="input" />
                  </ActionDialog>
                </div>
              )}
              {p.status === "done" && (
                <div className="mt-4 space-y-3 border-t border-line-2 pt-4">
                  <p className="flex gap-2 rounded-lg border border-ok/20 bg-ok-bg px-3 py-2 text-[12.5px] text-ok"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /><span><b>Final: {p.final}</b>{p.deviation_reason ? ` · alasan: ${p.deviation_reason}` : ""} · {p.legal_by} (Legal) {p.legal_at ? formatDateTime(p.legal_at) : ""} · {p.hr_by} {p.hr_at ? formatDateTime(p.hr_at) : ""}{p.kb_case_code ? ` · tercatat ${p.kb_case_code}` : ""}</span></p>
                  <LetterButton source="punishment" sourceId={p.code} level={p.final ?? p.matrix_std} code={p.matrix_code} occurrence={p.occurrence} unit={p.unit_name ?? ""} description={p.description} drive={drive} />
                </div>
              )}
              {p.status === "returned" && <p className="mt-3 rounded-lg bg-brand-subtle px-3 py-2 text-[12.5px] text-brand-deep">Dikembalikan oleh {p.rejected_by}: {p.rejected_reason}</p>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
