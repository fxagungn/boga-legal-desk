// HR Business Partner approval through a signed link (no LDMS account) — blueprint decision Q4.
import { getPunishment, PNS_STATUS } from "@/lib/ldms/discipline";
import { hrToken } from "@/app/ldms-actions";
import { HrApproveForm } from "./HrApproveForm";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const id = Number((await params).id);
  const t = (await searchParams).t ?? "";
  const valid = t && t === (await hrToken(id));
  const p = valid ? await getPunishment(id) : null;
  return (
    <div className="flex min-h-screen items-start justify-center bg-bg px-5 py-10">
      <div className="w-full max-w-[560px]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-brand text-[16px] font-extrabold text-white" aria-hidden="true">BG</span>
          <div>
            <h1 className="text-[18px] font-extrabold">Approval HR — Pengajuan Sanksi</h1>
            <p className="text-[12.5px] text-ink-3">Legal DMS Boga Group</p>
          </div>
        </div>
        <div className="mt-6 rounded-[14px] border border-line bg-surface p-6">
          {!p ? <p className="text-[14px] text-ink-2">Link tidak valid atau pengajuan tidak ditemukan.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12.5px] font-semibold">{p.code}</span>
                <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-bold ${PNS_STATUS[p.status]?.cls}`}>{PNS_STATUS[p.status]?.label}</span>
              </div>
              <h2 className="mt-2 text-[15px] font-bold">{p.matrix_code} — {p.sub_category}</h2>
              <p className="text-[12.5px] text-ink-3">{p.unit_name ?? "-"} · {p.occurrence} · Banding: {p.appeal} · Authority: {p.authority}</p>
              <p className="mt-3 text-[13.5px] whitespace-pre-line">{p.description}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-line p-3 text-[12.5px]">
                <div><dt className="text-ink-3">Sanksi baku matrix</dt><dd className="font-mono font-semibold text-brand">{p.matrix_std}</dd></div>
                <div><dt className="text-ink-3">Keputusan Legal</dt><dd className="font-mono font-semibold">{p.final ?? "—"}</dd></div>
                <div><dt className="text-ink-3">Oleh</dt><dd className="font-semibold">{p.legal_by ?? "—"}</dd></div>
              </dl>
              {p.deviation_reason && <p className="mt-2 text-[12.5px] text-ink-2">Alasan pembeda Legal: {p.deviation_reason}</p>}
              {p.status === "hr" ? <div className="mt-5"><HrApproveForm id={p.id} t={t} std={p.matrix_std} initial={p.final ?? p.matrix_std} /></div>
                : <p className="mt-5 rounded-lg bg-mute-bg px-3 py-2 text-[13px] text-ink-2">Pengajuan ini tidak sedang menunggu review HR.</p>}
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11.5px] text-ink-3">Jangan teruskan link ini. Keputusan tercatat atas nama yang Anda isi.</p>
      </div>
    </div>
  );
}
