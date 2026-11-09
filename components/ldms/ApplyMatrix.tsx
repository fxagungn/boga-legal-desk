"use client";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "@/components/actions";
import { cx } from "@/components/ui";
import type { ApplyResult, MatrixRule } from "@/lib/ldms/discipline";
import { applyMatrixAction, recordMatrixDecisionAction } from "@/app/ldms-actions";
import { LetterButton } from "./DecisionPanel";

const OCC = ["1st Occurrence", "Repeat", "Severe Case"];
const EXAMPLES: { label: string; code: string; occ: string; summary: string; chrono: string }[] = [
  { label: "QA-01 — temuan major berulang", code: "QA-01", occ: "Repeat", summary: "Audit QA menemukan temuan major kedua dalam 6 bulan.", chrono: "Audit QA rutin menemukan bahan tanpa label tanggal dan 1 item melewati shelf life; temuan major serupa tercatat 4 bulan sebelumnya. Produk belum tersaji ke tamu." },
  { label: "KS-04 — merokok, repeat", code: "KS-04", occ: "Repeat", summary: "Merokok di area gudang di luar smoking area untuk kedua kalinya.", chrono: "Dilaporkan SPV shift dengan foto; sebelumnya sudah menerima ST untuk perbuatan yang sama. Tidak ada kerusakan, namun dekat bahan mudah terbakar." },
  { label: "FK-06-D — pencurian uang", code: "FK-06-D", occ: "1st Occurrence", summary: "Selisih setoran kas berulang selama 3 minggu.", chrono: "Rekonsiliasi POS vs setoran menunjukkan void bill setelah pembayaran tunai diterima; CCTV kasir mengonfirmasi; pengakuan dalam klarifikasi tertulis." },
  { label: "PT-05-B — lalai pengawasan, major", code: "PT-05-B", occ: "1st Occurrence", summary: "Kegagalan pengawasan pencatatan suhu chiller menyebabkan komplain tamu.", chrono: "Log suhu chiller tidak diisi 4 hari; bahan melewati shelf life terpakai saat jam sibuk; tamu melapor gejala dan biaya medis ditanggung perusahaan." },
  { label: "FK-03 — kartu diskon untuk pelanggan", code: "FK-03", occ: "1st Occurrence", summary: "ID card diskon karyawan dipakai untuk transaksi pelanggan umum.", chrono: "Anomali laporan diskon POS: 6 bill pelanggan umum memakai ID karyawan on duty; belum ada bukti penerimaan uang tambahan." },
];

export function ApplyMatrix({ rules, units, initialCode, ai, canRun, drive }: { rules: MatrixRule[]; units: string[]; initialCode?: string; ai: string | null; canRun: boolean; drive: boolean }) {
  const [code, setCode] = useState(rules.find((r) => r.code === initialCode)?.code ?? rules[0]?.code ?? "");
  const [occ, setOcc] = useState(OCC[0]);
  const [unit, setUnit] = useState(units[0] ?? "");
  const [summary, setSummary] = useState("");
  const [chrono, setChrono] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ApplyResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const r = rules.find((x) => x.code === code);
  const std = !r ? "-" : occ === "Repeat" ? r.s_repeat : occ === "Severe Case" ? r.s_severe : r.s_1st;

  async function go() {
    setBusy(true); setErr(null); setRes(null); setSaved(false);
    const out = await applyMatrixAction({ code, occurrence: occ, unit, summary, chronology: chrono });
    setBusy(false);
    if (out && "ok" in out) { setRes(out.data.result); setRunId(out.data.runId); }
    else if (out && "error" in out) setErr(out.error);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_1fr]">
      <section className="card self-start p-5">
        <h2 className="text-[15px] font-extrabold">Klasifikasi Kasus</h2>
        <div className="mt-4 grid gap-3.5">
          <div>
            <label className="label" htmlFor="am-code">Kode pelanggaran</label>
            <select id="am-code" value={code} onChange={(e) => setCode(e.target.value)} className="input">
              {rules.map((m) => <option key={m.code} value={m.code}>{m.code} — {m.sub_category.length > 80 ? m.sub_category.slice(0, 78) + "…" : m.sub_category}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="am-occ">Occurrence</label>
            <select id="am-occ" value={occ} onChange={(e) => setOcc(e.target.value)} className="input">{OCC.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          {r && (
            <div className="rounded-xl border border-brand-line bg-brand-subtle p-4" aria-live="polite">
              <div className="font-mono text-[11.5px] text-ink-3">{r.code} · {r.category}</div>
              <div className="mt-0.5 text-[13px]">{r.sub_category}</div>
              <div className="mt-3 text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">Sanksi baku</div>
              <div className="font-mono text-[24px] font-semibold text-brand">{std}</div>
              {std.includes("ATAU") && <p className="mt-1 text-[12px] text-brand-deep">Sel &ldquo;ATAU&rdquo;: kriteria pembeda harus dibuktikan investigasi — tidak dipilih sepihak.</p>}
              {std === "-" && <p className="mt-1 text-[12px] text-brand-deep">Tidak diatur matrix untuk occurrence ini — gunakan kode/occurrence yang berlaku.</p>}
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                <div><dt className="text-ink-3">Hak banding (14 hari kalender)</dt><dd className="font-semibold">{r.appeal}</dd></div>
                <div><dt className="text-ink-3">Line of authority</dt><dd className="font-semibold">{r.authority}</dd></div>
              </dl>
            </div>
          )}
          <div>
            <label className="label" htmlFor="am-unit">Unit</label>
            <select id="am-unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="input">{units.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <div>
            <label className="label" htmlFor="am-sum">Ringkasan kasus</label>
            <input id="am-sum" value={summary} onChange={(e) => setSummary(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="am-chr">Kronologi & temuan (wajib, tanpa nama)</label>
            <textarea id="am-chr" value={chrono} onChange={(e) => setChrono(e.target.value)} rows={5} className="input" />
          </div>
          <div>
            <p className="mb-1.5 text-[11.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">Contoh cepat</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((x) => (
                <button key={x.label} type="button" className="rounded-lg border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-brand-line hover:text-ink"
                  onClick={() => { setCode(x.code); setOcc(x.occ); setSummary(x.summary); setChrono(x.chrono); }}>{x.label}</button>
              ))}
            </div>
          </div>
          {ai && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{ai} Kartu aturan baku di atas tetap berlaku tanpa AI.</p>}
          <button type="button" onClick={go} disabled={busy || !!ai || !canRun || chrono.trim().length < 20} className="btn btn-primary btn-lg w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Terapkan matrix & verifikasi klasifikasi
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {!res && !err && !busy && <div className="card border-dashed px-6 py-14 text-center text-[13.5px] text-ink-2">Isi klasifikasi di kiri lalu jalankan. Hasil AI berstatus <b>draft</b> — tingkat sanksi tetap dari matrix.</div>}
        {busy && <div className="card flex items-center justify-center gap-2 px-6 py-14 text-[13.5px] text-ink-2"><Loader2 size={16} className="animate-spin" /> Menganalisis terhadap Summary Matrix Disiplin…</div>}
        {err && <p className="card border-brand-line bg-brand-subtle px-5 py-4 text-[13px] text-brand-deep">{err}</p>}
        {res && (
          <>
            <div className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn">DRAFT — perlu approval</span>
                <span className="font-mono text-[12px] text-ink-3">{res.kodeDipakai} · {res.occurrence}</span>
                <span className="ml-auto text-[12px] font-semibold text-ink-2">Keyakinan: {res.keyakinanLabel} ({res.skorKeyakinan})</span>
              </div>
              <div className="mt-3 text-[10.5px] font-bold tracking-[0.6px] text-ink-3 uppercase">Sanksi per matrix</div>
              <div className="font-mono text-[30px] font-semibold text-brand">{res.tingkat}</div>
              <div className="text-[13px] text-ink-2">{res.label}</div>
              <p className="mt-2 text-[12.5px]"><b>Banding:</b> {res.banding} · <b>Authority:</b> {res.authority}</p>
              {res.tingkat !== std && std !== "-" && !std.includes("ATAU") && <p className="mt-2 rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">Hasil AI ({res.tingkat}) berbeda dari sel matrix ({std}) — keputusan tetap mengikuti matrix kecuali ada kode yang lebih tepat.</p>}
              <p className="mt-3 text-[13.5px]">{res.ringkasanAnalisis}</p>
              <p className={cx("mt-2 flex gap-2 text-[12.5px]", res.cukupData ? "text-ok" : "text-warn")}>{res.cukupData ? <CheckCircle2 size={15} className="mt-0.5" /> : <AlertTriangle size={15} className="mt-0.5" />}{res.catatanData || (res.cukupData ? "Unsur perbuatan sudah memenuhi kode." : "Bukti belum cukup.")}</p>
            </div>
            {res.kodeAlternatif?.ada && (
              <div className="card border-warn/30 bg-warn-bg p-5 text-[13px] text-warn"><b>Klasifikasi kode perlu ditinjau — usulan {res.kodeAlternatif.kode}.</b> {res.kodeAlternatif.penjelasan}</div>
            )}
            <div className="card p-5">
              <h3 className="text-[13px] font-extrabold">Dasar aturan dari matrix</h3>
              <ul className="mt-2 space-y-2">{res.dasar?.map((d, i) => (
                <li key={i} className="rounded-lg bg-bg px-3 py-2 text-[12.5px]"><span className="font-mono font-semibold">{d.kode}</span> · {d.judul} · <b>{d.sanksiMatrix}</b> · relevansi {d.relevansi}%<br /><i className="text-ink-2">&ldquo;{d.kutipan}&rdquo;</i><br />{d.alasan}</li>
              ))}</ul>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><h3 className="text-[13px] font-extrabold">Faktor memberatkan</h3><ul className="mt-1 list-disc pl-4 text-[12.5px] text-ink-2">{res.faktorMemberatkan?.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                <div><h3 className="text-[13px] font-extrabold">Faktor meringankan</h3><ul className="mt-1 list-disc pl-4 text-[12.5px] text-ink-2">{res.faktorMeringankan?.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-3">Faktor di atas untuk pembuktian, bukan untuk mengubah tingkat sanksi.</p>
              <h3 className="mt-4 text-[13px] font-extrabold">Langkah investigasi & administrasi</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12.5px] text-ink-2">{res.langkahLegal?.map((x, i) => <li key={i}>{x}</li>)}</ol>
            </div>
            <div className="card flex flex-wrap items-start gap-2 p-5">
              <button type="button" className="btn btn-primary btn-sm" disabled={saved || !runId} onClick={async () => {
                const out = await recordMatrixDecisionAction(runId!, res.tingkat);
                if (out && "ok" in out) { setSaved(true); toast("Penerapan matrix dicatat di log AI"); } else if (out && "error" in out) toast(out.error);
              }}><CheckCircle2 size={14} /> {saved ? "Tercatat" : "Setujui & catat penerapan matrix"}</button>
              <button type="button" className="btn btn-sm" onClick={go}><RotateCcw size={14} /> Periksa ulang</button>
              <div className="w-full pt-2"><LetterButton source="matrix" sourceId={runId ?? ""} level={res.tingkat.includes("ATAU") ? std : res.tingkat} code={res.kodeDipakai || code} occurrence={res.occurrence || occ} unit={unit} description={[summary, chrono].filter(Boolean).join("\n")} drive={drive} /></div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
