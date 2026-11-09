"use client";
import { useState } from "react";
import { ActionForm, Submit } from "@/components/actions";
import { submitPunishmentAction } from "@/app/ldms-actions";
import type { MatrixRule } from "@/lib/ldms/discipline";

const LEVELS = ["ST", "SP1", "SP2", "SP3 NON PHK", "SP3 PHK"];
const OCC = ["1st Occurrence", "Repeat", "Severe Case"];

/** Pengajuan sanksi (blueprint §7.2). No employee name field, by design. */
export function PunishmentForm({ rules, units, functions }: { rules: MatrixRule[]; units: { id: number; name: string }[]; functions: string[] }) {
  const [code, setCode] = useState(rules[0]?.code ?? "");
  const [occ, setOcc] = useState(OCC[0]);
  const r = rules.find((x) => x.code === code);
  const std = !r ? "-" : occ === "Repeat" ? r.s_repeat : occ === "Severe Case" ? r.s_severe : r.s_1st;
  return (
    <ActionForm action={submitPunishmentAction} resetOnDone className="grid gap-3.5">
      <div>
        <label className="label" htmlFor="pn-fn">Diajukan oleh (fungsi)</label>
        <select id="pn-fn" name="submitter_fn" className="input">{functions.map((f) => <option key={f}>{f}</option>)}</select>
      </div>
      <div>
        <label className="label" htmlFor="pn-unit">Outlet / unit</label>
        <select id="pn-unit" name="unit_id" className="input">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pn-occ">Occurrence</label>
          <select id="pn-occ" name="occurrence" value={occ} onChange={(e) => setOcc(e.target.value)} className="input">{OCC.map((o) => <option key={o}>{o}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="pn-prop">Usulan sanksi atasan</label>
          <select id="pn-prop" name="proposed" className="input"><option value="">—</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pn-code">Kode pelanggaran (matrix)</label>
        <select id="pn-code" name="matrix_code" value={code} onChange={(e) => setCode(e.target.value)} className="input">
          {rules.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.sub_category.length > 80 ? m.sub_category.slice(0, 78) + "…" : m.sub_category}</option>)}
        </select>
        {r && (
          <p className="mt-1.5 text-[12.5px] font-semibold text-brand-deep" aria-live="polite">
            Matrix {r.code} · {occ} → <b>{std === "-" ? "tidak diatur matrix (pilih occurrence lain)" : std}</b>. Banding: {r.appeal}. Authority: {r.authority}.
          </p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="pn-desc">Uraian perbuatan & bukti</label>
        <textarea id="pn-desc" name="description" rows={4} required minLength={20} className="input" placeholder="Perbuatan, waktu, dampak, bukti (CCTV/POS/BA) — tanpa nama atau identitas pribadi" />
      </div>
      <div>
        <label className="label" htmlFor="pn-ev">Link bukti (Google Drive, opsional)</label>
        <input id="pn-ev" name="evidence_url" type="url" className="input" placeholder="https://drive.google.com/…" />
      </div>
      <Submit className="btn btn-primary btn-lg w-full">Ajukan untuk approval Legal & HR</Submit>
    </ActionForm>
  );
}
