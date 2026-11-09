"use client";
import { useState } from "react";
import { Copy, FileText, Link2, Loader2 } from "lucide-react";
import { ActionForm, Submit, toast } from "@/components/actions";
import { cx } from "@/components/ui";
import type { Result } from "@/app/actions";
import { hrLinkAction, letterAction } from "@/app/ldms-actions";

const LEVELS = ["ST", "SP1", "SP2", "SP3 NON PHK", "SP3 PHK"];

function rank(v: string) {
  const t = v.toUpperCase();
  if (t.includes("SP3 PHK")) return 4;
  let b = -1;
  LEVELS.forEach((l, i) => { if (t.includes(l)) b = Math.max(b, i); });
  return b;
}
function gap(std: string, final: string) {
  if (!std || std === "-") return false;
  if (std.toUpperCase().includes("ATAU")) return !std.toUpperCase().split("ATAU").some((o) => rank(o.trim()) === rank(final));
  return rank(std) !== rank(final);
}

/** Decision buttons + mandatory deviation reason (blueprint §7.3–7.4). */
export function DecisionPanel({ id, std, initial, proposed, approve, label, dark }: {
  id: number; std: string; initial: string; proposed: string | null; approve: (p: Result, f: FormData) => Promise<Result>; label: string; dark?: boolean;
}) {
  const [final, setFinal] = useState(initial);
  const deviates = gap(std, final);
  return (
    <ActionForm action={approve} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="final" value={final} />
      {proposed && proposed !== initial && gap(std, proposed) && (
        <p className="rounded-lg bg-mute-bg px-3 py-2 text-[12.5px] text-ink-2">Usulan atasan ({proposed}) berbeda dari matrix ({std}); pilihan default sudah disetel ke sanksi baku.</p>
      )}
      <div role="radiogroup" aria-label="Keputusan sanksi" className="flex flex-wrap gap-1.5">
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={final === l} onClick={() => setFinal(l)}
            className={cx("rounded-lg border px-3 py-1.5 font-mono text-[12px] font-semibold", final === l ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:text-ink")}>{l}</button>
        ))}
      </div>
      {deviates && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">Keputusan {final} menyimpang dari matrix ({std}) — alasan pembeda wajib diisi.</p>}
      <div>
        <label className="label" htmlFor={`rs-${id}`}>Alasan pembeda {deviates ? "(wajib)" : "(opsional)"}</label>
        <textarea id={`rs-${id}`} name="reason" rows={2} required={deviates} className={cx("input", deviates && "border-brand")} />
      </div>
      <Submit className={cx("btn w-full", dark ? "bg-ink text-white hover:bg-ink/90" : "btn-primary")}>{label}</Submit>
    </ActionForm>
  );
}

export function HrLinkButton({ id }: { id: number }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-sm" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await hrLinkAction(id);
        setBusy(false);
        if (r && "ok" in r) {
          setUrl(r.data.url);
          toast(r.data.sent ? `Link approval dikirim ke ${r.data.emails.join(", ")}` : "Link approval HR siap disalin");
        } else if (r && "error" in r) toast(r.error);
      }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Link approval HR</button>
      {url && (
        <div className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-[11.5px]">{url}</code>
          <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Salin link" onClick={() => { navigator.clipboard.writeText(url); toast("Link disalin"); }}><Copy size={14} /></button>
        </div>
      )}
    </div>
  );
}

export function LetterButton(props: { source: string; sourceId: string; level: string; code: string; occurrence: string; unit: string; description: string; drive: boolean }) {
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const go = async (toDrive: boolean) => {
    setBusy(true);
    const r = await letterAction({ ...props, toDrive });
    setBusy(false);
    if (r && "ok" in r) { setBody(r.data.body); setLink(r.data.driveUrl); toast(r.data.driveUrl ? "Draft surat disimpan ke Google Drive" : `Draft ${r.data.code} dibuat`); }
    else if (r && "error" in r) toast(r.error);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => go(false)}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Draft surat {props.level}</button>
        {props.drive && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => go(true)}>Simpan draft ke Google Docs</button>}
      </div>
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-[12.5px] font-semibold">Buka draft di Google Docs</a>}
      {body && <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-bg p-3 font-sans text-[12.5px] whitespace-pre-wrap">{body}</pre>}
    </div>
  );
}
