import { Check, CornerUpLeft, Hourglass, MoreHorizontal, Play, RotateCcw } from "lucide-react";
import * as A from "@/app/actions";
import type { DocRow } from "@/lib/insight";
import type { Journey } from "@/lib/journey";
import type { Member } from "@/lib/repo";
import { canAct } from "@/lib/flow";
import { revisionTarget, ROLE_LABEL, stageDef, typeDef } from "@/lib/workflow";
import type { AppSettings } from "@/lib/db";
import { ActionButton, ActionDialog } from "./actions";
import { cx } from "./ui";

/** The one place a user decides what happens next. `layout="bar"` = sticky mobile bar. */
export function DocActions({ doc, j, me, settings, layout = "inline" }: { doc: DocRow; j: Journey; me: Member; settings: AppSettings; layout?: "inline" | "bar" }) {
  const wf = settings.workflows;
  const st = stageDef(wf, doc.doc_type, doc.stage);
  const allowed = canAct(me, doc, settings);
  const lead = ["manager", "agm", "admin"].includes(me.role);
  const idx = j.steps.findIndex((s) => s.key === doc.stage);
  const next = idx >= 0 ? j.steps[idx + 1] : undefined;
  const bar = layout === "bar";
  const grow = bar ? "flex-1" : "";

  let main: React.ReactNode = null;
  if (j.closed) {
    main = <ActionButton action={A.reopenAction} id={doc.id} className={cx("btn", grow)} success="Dokumen dibuka kembali"><RotateCcw size={16} /> Buka kembali</ActionButton>;
  } else if (doc.status === "on_hold") {
    main = <ActionButton action={A.resumeAction} id={doc.id} className={cx("btn btn-primary", grow)} success="Dilanjutkan"><Play size={16} /> Balasan sudah masuk, lanjutkan</ActionButton>;
  } else if (st && allowed && st.approval) {
    main = (
      <>
        <ActionDialog
          action={A.revisionAction} id={doc.id} triggerClass={cx("btn", grow)}
          trigger={<><CornerUpLeft size={16} /> Kembalikan</>}
          title="Kembalikan untuk revisi" desc={`Dokumen kembali ke ${revisionTarget(wf, doc.doc_type, st.key)?.label} dan PIC mendapat notifikasi.`}
          submit="Kembalikan" success="Dikembalikan untuk revisi"
        >
          <label className="label" htmlFor="rev-note">Apa yang perlu diperbaiki?</label>
          <textarea id="rev-note" name="note" rows={4} className="input" required placeholder="Mis. pasal 3 soal denda perlu dinaikkan menjadi 0,5%/hari" />
        </ActionDialog>
        <ActionDialog
          action={A.advanceAction} id={doc.id} triggerClass={cx("btn btn-ok", grow)} submitClass="btn btn-ok"
          trigger={<><Check size={16} /> Setujui</>}
          title="Setujui dokumen ini?" desc={next ? `Setelah disetujui, dokumen lanjut ke ${next.label} (${next.owner}).` : "Ini persetujuan terakhir."}
          submit="Ya, setujui"
        >
          <label className="label" htmlFor="adv-note">Catatan (opsional)</label>
          <textarea id="adv-note" name="note" rows={3} className="input" placeholder="Mis. disetujui, mohon pastikan lampiran B ditandatangani" />
        </ActionDialog>
      </>
    );
  } else if (st && allowed) {
    main = (
      <>
        {!bar && (
          <ActionDialog
            action={A.holdAction} id={doc.id} triggerClass="btn"
            trigger={<><Hourglass size={16} /> Menunggu pihak luar</>}
            title="Menunggu balasan pihak luar?" desc="Hitungan waktu berhenti sementara dan otomatis jalan lagi saat mereka membalas email."
            submit="Ya, tunggu dulu" success="Ditandai menunggu pihak luar"
          >
            <label className="label" htmlFor="hold-reason">Menunggu apa?</label>
            <input id="hold-reason" name="reason" className="input" required placeholder="Mis. markup balik dari vendor" />
          </ActionDialog>
        )}
        <ActionDialog
          action={A.advanceAction} id={doc.id} triggerClass={cx("btn btn-primary", grow)}
          trigger={<><Check size={16} /> {next ? (bar ? "Selesai, kirim lanjut" : `Selesai, kirim ke ${next.short}`) : "Selesai & arsipkan"}</>}
          title={`${st.label} sudah selesai?`}
          desc={next ? `Dokumen pindah ke ${next.label}. ${next.owner} akan mendapat notifikasi.` : "Dokumen akan ditandai selesai dan diarsipkan."}
          submit={next ? "Ya, kirim" : "Ya, selesaikan"}
        >
          <label className="label" htmlFor="adv-note2">Catatan untuk langkah berikutnya (opsional)</label>
          <textarea id="adv-note2" name="note" rows={3} className="input" placeholder="Mis. markup final sudah disepakati vendor" />
        </ActionDialog>
      </>
    );
  } else if (st && bar) {
    main = (
      <p className="flex-1 py-2 text-center text-[14px] text-ink-2">
        Menunggu <span className="font-semibold text-ink">{j.holder.name}</span>
        {st.approval && j.holder.name !== ROLE_LABEL[st.role] ? ` (${ROLE_LABEL[st.role]})` : ""}
      </p>
    );
  }

  const more = lead && !j.closed && !bar && (
    <details className="relative">
      <summary className="btn btn-ghost px-2.5 [&::-webkit-details-marker]:hidden" aria-label="Aksi lain"><MoreHorizontal size={18} /></summary>
      <div className="absolute right-0 z-20 mt-1 flex w-56 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)] [&_.btn]:w-full [&_.btn]:justify-start">
        <ActionDialog
          action={A.moveAction} id={doc.id} triggerClass="btn btn-ghost" trigger="Pindahkan ke langkah lain"
          title="Pindahkan ke langkah lain" desc="Gunakan bila proses di luar sistem sudah berjalan lebih jauh." submit="Pindahkan" success="Langkah dipindah"
        >
          <label className="label" htmlFor="mv-stage">Langkah tujuan</label>
          <select id="mv-stage" name="stage" className="input" defaultValue={doc.stage}>
            {typeDef(wf, doc.doc_type).stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label className="label mt-3" htmlFor="mv-note">Alasan</label>
          <input id="mv-note" name="note" className="input" />
        </ActionDialog>
        <ActionDialog
          action={A.cancelAction} id={doc.id} triggerClass="btn btn-ghost btn-danger" trigger="Batalkan dokumen"
          title="Batalkan dokumen ini?" desc="Dokumen keluar dari antrean. Bisa dibuka kembali nanti." submit="Batalkan dokumen" submitClass="btn btn-primary" success="Dokumen dibatalkan"
        >
          <label className="label" htmlFor="cc-reason">Alasan</label>
          <input id="cc-reason" name="reason" className="input" required />
        </ActionDialog>
      </div>
    </details>
  );

  if (bar) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="flex items-center gap-2">{main}</div>
      </div>
    );
  }
  if (!main && !more) return null;
  return <div className="flex flex-wrap items-center gap-2">{main}{more}</div>;
}
