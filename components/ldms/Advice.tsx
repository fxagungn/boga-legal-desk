"use client";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { AdviceResult } from "@/lib/ldms/history";
import { inspectionAdviceAction, libraryAdviceAction } from "@/app/ldms-actions";

export function AdviceView({ r }: { r: AdviceResult }) {
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn">DRAFT — untuk approval Legal Supervisor</span>
        <span className="text-[12px] font-semibold text-ink-2">Keyakinan: {r.keyakinan}</span>
      </div>
      <p>{r.ringkasan}</p>
      {r.catatan && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{r.catatan}</p>}
      {r.poin?.length > 0 && <div><h4 className="font-extrabold">Poin</h4><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">{r.poin.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {r.risiko?.length > 0 && <div><h4 className="font-extrabold">Risiko</h4><ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">{r.risiko.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {r.referensi?.length > 0 && (
        <div><h4 className="font-extrabold">Referensi</h4>
          <ul className="mt-1 space-y-1.5">{r.referensi.map((x, i) => (
            <li key={i} className="rounded-lg bg-bg px-3 py-2 text-[12.5px]"><a href={`#${x.id}`} className="font-mono font-semibold">{x.id}</a> · {x.judul} · relevansi {x.relevansi}%<br /><i className="text-ink-2">&ldquo;{x.kutipan}&rdquo;</i>{x.relevan ? <><br />{x.relevan}</> : null}</li>
          ))}</ul>
        </div>
      )}
      {r.langkah?.length > 0 && <div><h4 className="font-extrabold">Langkah</h4><ol className="mt-1 list-decimal space-y-0.5 pl-5 text-ink-2">{r.langkah.map((x, i) => <li key={i}>{x}</li>)}</ol></div>}
    </div>
  );
}

export function LibraryConsult({ ai }: { ai: string | null }) {
  const [f, setF] = useState({ kind: "PSM", counterparty: "", value: "", issue: "" });
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<AdviceResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="lc-k">Jenis dokumen</label>
          <select id="lc-k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["PSM", "PKS", "License", "Legal Opinion"].map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label className="label" htmlFor="lc-cp">Pihak lawan</label><input id="lc-cp" className="input" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></div>
      </div>
      <div><label className="label" htmlFor="lc-v">Nilai / tenor</label><input id="lc-v" className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
      <div><label className="label" htmlFor="lc-i">Isu (klausul sengketa / permintaan pihak lawan / keputusan bisnis)</label><textarea id="lc-i" rows={3} className="input" value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} /></div>
      {ai && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{ai}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || !!ai || f.issue.trim().length < 10} onClick={async () => {
        setBusy(true); setErr(null); setR(null);
        const out = await libraryAdviceAction(f);
        setBusy(false);
        if (out && "ok" in out) setR(out.data); else if (out && "error" in out) setErr(out.error);
      }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Susun rekomendasi</button>
      {err && <p className="text-[13px] text-bad">{err}</p>}
      {r && <div className="rounded-xl border border-line p-4"><AdviceView r={r} /></div>}
    </div>
  );
}

export function InspectionPrep({ ai, units }: { ai: string | null; units: { id: number; name: string }[] }) {
  const [f, setF] = useState({ agency: "", unitId: units[0]?.id ?? 0, kind: "", context: "" });
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<{ result: AdviceResult; due: { code: string; izin: string; jatuhTempo: string | null; sisa: number | null }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ip-a">Instansi</label><input id="ip-a" className="input" placeholder="mis. Disnakertrans, Dinas Kesehatan" value={f.agency} onChange={(e) => setF({ ...f, agency: e.target.value })} /></div>
        <div><label className="label" htmlFor="ip-u">Unit</label>
          <select id="ip-u" className="input" value={f.unitId} onChange={(e) => setF({ ...f, unitId: Number(e.target.value) })}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      </div>
      <div><label className="label" htmlFor="ip-k">Jenis pemeriksaan</label><input id="ip-k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} /></div>
      <div><label className="label" htmlFor="ip-c">Konteks tambahan</label><textarea id="ip-c" rows={2} className="input" value={f.context} onChange={(e) => setF({ ...f, context: e.target.value })} /></div>
      {ai && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{ai}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || !!ai || !f.agency.trim()} onClick={async () => {
        setBusy(true); setErr(null); setR(null);
        const out = await inspectionAdviceAction(f);
        setBusy(false);
        if (out && "ok" in out) setR(out.data); else if (out && "error" in out) setErr(out.error);
      }}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Susun rekomendasi tindak lanjut</button>
      {err && <p className="text-[13px] text-bad">{err}</p>}
      {r && (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <AdviceView r={r.result} />
          {r.due.length > 0 && <div className="text-[12.5px]"><h4 className="font-extrabold">Izin unit yang jatuh tempo ≤120 hari</h4><ul className="mt-1 space-y-0.5">{r.due.map((d) => <li key={d.code}><a href={`/perizinan?pic=all&d=${d.code}`} className="font-mono font-semibold">{d.code}</a> {d.izin} — {d.jatuhTempo} ({d.sisa !== null && d.sisa < 0 ? `lewat ${-d.sisa} hari` : `${d.sisa} hari`})</li>)}</ul></div>}
        </div>
      )}
    </div>
  );
}
