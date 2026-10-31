"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Role, StageDef, TypeDef, Workflows } from "@/lib/workflow";
import { ActionForm, Submit } from "./actions";
import type { Result } from "@/app/actions";

const ROLES: { value: Role; label: string }[] = [
  { value: "staff", label: "Staff Legal (PIC)" },
  { value: "manager", label: "Manager Legal" },
  { value: "agm", label: "AGM Legal" },
  { value: "cpo", label: "CPLO" },
];

type Usage = Record<string, Record<string, number>>; // type -> stage -> open docs

export function WorkflowEditor({ initial, defaults, usage, threshold, action, readOnly }: {
  initial: Workflows; defaults: Workflows; usage: Usage; threshold: string; readOnly: boolean;
  action: (prev: Result, f: FormData) => Promise<Result>;
}) {
  const [wf, setWf] = useState<Workflows>(initial);
  const [sel, setSel] = useState(0);
  const dirty = useMemo(() => JSON.stringify(wf) !== JSON.stringify(initial), [wf, initial]);
  const t = wf[sel] ?? wf[0];
  const typeUse = (key: string) => Object.values(usage[key] ?? {}).reduce((a, b) => a + b, 0);

  const setType = (patch: Partial<TypeDef>) => setWf((w) => w.map((x, i) => (i === sel ? { ...x, ...patch } : x)));
  const setStage = (k: number, patch: Partial<StageDef>) => setType({ stages: t.stages.map((x, i) => (i === k ? { ...x, ...patch } : x)) });
  const move = (k: number, d: -1 | 1) => {
    const s = [...t.stages];
    const [x] = s.splice(k, 1);
    s.splice(k + d, 0, x);
    setType({ stages: s });
  };
  const addStage = () => setType({ stages: [...t.stages.slice(0, -1), { key: "", label: "Langkah baru", role: "staff", slaDays: 2, approval: false, condition: "always" }, ...t.stages.slice(-1)] });
  const addType = () => {
    setWf((w) => [...w, { key: "", label: "Jenis dokumen baru", tag: "", stages: defaults.find((d) => d.key === "other")?.stages.map((x) => ({ ...x })) ?? [] }]);
    setSel(wf.length);
  };

  return (
    <ActionForm action={action} success="Alur persetujuan disimpan">
      <input type="hidden" name="workflows" value={JSON.stringify(wf)} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {wf.map((x, i) => (
          <button key={i} type="button" onClick={() => setSel(i)}
            className={`chip h-9 px-3.5 text-[13.5px] ${i === sel ? "bg-ink text-white" : "border border-line bg-surface text-ink-2 hover:text-ink"}`}>
            {x.label || "Tanpa nama"}
          </button>
        ))}
        {!readOnly && <button type="button" onClick={addType} className="btn btn-ghost btn-sm"><Plus size={15} /> Jenis dokumen</button>}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
        <div>
          <label className="label" htmlFor="wf-name">Nama jenis dokumen</label>
          <input id="wf-name" className="input" value={t.label} disabled={readOnly} onChange={(e) => setType({ label: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="wf-tag">Tag di subjek email</label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">[</span>
            <input id="wf-tag" className="input px-5 uppercase" value={t.tag} disabled={readOnly} placeholder="NDA" onChange={(e) => setType({ tag: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">]</span>
          </div>
        </div>
        {!readOnly && wf.length > 1 && (
          <div className="flex items-end">
            <button type="button" disabled={typeUse(t.key) > 0} title={typeUse(t.key) ? `Masih dipakai ${typeUse(t.key)} dokumen berjalan` : undefined}
              onClick={() => { setWf((w) => w.filter((_, i) => i !== sel)); setSel(0); }} className="btn btn-danger">
              <Trash2 size={15} /> Hapus jenis
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <div className="hidden grid-cols-[28px_1.4fr_1fr_120px_1.2fr_92px_96px] gap-2 border-b border-line bg-bg px-3 py-2 text-[12px] font-semibold text-ink-2 md:grid">
          <span>#</span><span>Langkah</span><span>Dikerjakan oleh</span><span>Jenis</span><span>Kapan dilalui</span><span>Target</span><span />
        </div>
        <ol className="divide-y divide-line-2">
          {t.stages.map((st, k) => {
            const used = usage[t.key]?.[st.key] ?? 0;
            return (
              <li key={k} className="grid gap-2 px-3 py-2.5 md:grid-cols-[28px_1.4fr_1fr_120px_1.2fr_92px_96px] md:items-center">
                <span className="hidden text-[13px] font-bold text-ink-3 tnum md:block">{k + 1}</span>
                <input aria-label="Nama langkah" className="input h-9" value={st.label} disabled={readOnly} onChange={(e) => setStage(k, { label: e.target.value })} />
                <select aria-label="Dikerjakan oleh" className="input h-9" value={st.role} disabled={readOnly} onChange={(e) => setStage(k, { role: e.target.value as Role, approval: e.target.value !== "staff" ? true : st.approval })}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <select aria-label="Jenis langkah" className="input h-9" value={st.approval ? "approval" : "work"} disabled={readOnly} onChange={(e) => setStage(k, { approval: e.target.value === "approval" })}>
                  <option value="work">Pengerjaan</option>
                  <option value="approval">Persetujuan</option>
                </select>
                <select aria-label="Kapan dilalui" className="input h-9" value={st.condition} disabled={readOnly} onChange={(e) => setStage(k, { condition: e.target.value as StageDef["condition"] })}>
                  <option value="always">Selalu</option>
                  <option value="high_value">Jika nilai ≥ {threshold} / risiko tinggi</option>
                </select>
                <div className="relative">
                  <input aria-label="Target hari kerja" type="number" min={0.5} max={60} step={0.5} className="input h-9 pr-11 tnum" value={st.slaDays} disabled={readOnly} onChange={(e) => setStage(k, { slaDays: Number(e.target.value) })} />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12.5px] text-ink-3">hari</span>
                </div>
                {!readOnly && (
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" className="btn btn-ghost btn-sm px-1.5" disabled={k === 0} onClick={() => move(k, -1)} aria-label="Naikkan"><ArrowUp size={15} /></button>
                    <button type="button" className="btn btn-ghost btn-sm px-1.5" disabled={k === t.stages.length - 1} onClick={() => move(k, 1)} aria-label="Turunkan"><ArrowDown size={15} /></button>
                    <button type="button" className="btn btn-ghost btn-sm btn-danger px-1.5" disabled={used > 0 || t.stages.length === 1}
                      title={used ? `Masih ada ${used} dokumen di langkah ini` : "Hapus langkah"}
                      onClick={() => setType({ stages: t.stages.filter((_, i) => i !== k) })} aria-label="Hapus langkah"><Trash2 size={15} /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!readOnly && (
          <div className="border-t border-line-2 px-3 py-2.5">
            <button type="button" onClick={addStage} className="btn btn-ghost btn-sm"><Plus size={15} /> Tambah langkah</button>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl bg-bg px-4 py-3 text-[13.5px]">
        <span className="font-semibold text-ink-2">Urutan: </span>
        {t.stages.map((st, k) => (
          <span key={k}>
            {k > 0 && <span className="mx-1.5 text-ink-3">→</span>}
            <span className={st.approval ? "font-semibold text-brand" : ""}>{st.label}</span>
            {st.condition === "high_value" && <span className="text-ink-3">*</span>}
          </span>
        ))}
        {t.stages.some((x) => x.condition === "high_value") && <p className="mt-1 text-[12.5px] text-ink-3">* hanya untuk nilai besar atau risiko tinggi. Tiap dokumen tetap bisa diatur sendiri di halaman dokumennya.</p>}
      </div>

      {!readOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Submit>Simpan alur</Submit>
          <button type="button" className="btn" disabled={!dirty} onClick={() => setWf(initial)}>Batalkan perubahan</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setWf(defaults.map((d) => ({ ...d, stages: d.stages.map((x) => ({ ...x })) }))); setSel(0); }}>
            <RotateCcw size={15} /> Kembalikan ke default
          </button>
          {dirty && <span className="text-[13px] font-semibold text-warn">Ada perubahan yang belum disimpan</span>}
        </div>
      )}
    </ActionForm>
  );
}
