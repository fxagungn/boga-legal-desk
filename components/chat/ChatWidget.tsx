"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { cx } from "@/components/ui";

interface Msg { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "Izin apa yang overdue dan siapa PIC-nya?",
  "Dokumen mana yang bersomasi dan bagaimana status acknowledge-nya?",
  "ULA mana yang berakhir paling dekat dan berapa unit fee-nya?",
  "Berapa total estimasi biaya renewal 30 hari ke depan per brand?",
  "Sanksi untuk merokok berulang menurut matrix?",
  "Temuan Disnakertrans apa yang berulang?",
];

const ID_RE = /\b(D\d{4}|(?:MLA|ULA|PKS|PSM)-\d{3}|PNS-\d{4}-\d{3}|YRS-\d{4}-\d{3}|INS-\d{4}-\d{3}|LIB-[A-Z]{2,3}-\d{3})\b/g;

function hrefFor(id: string) {
  if (/^D\d/.test(id)) return `/perizinan?pic=all&d=${id}`;
  if (/^(MLA|ULA|PKS|PSM)-/.test(id)) return `/perjanjian?tab=${id.slice(0, 3)}&d=${id}`;
  if (id.startsWith("PNS-")) return `/sanksi#${id}`;
  if (id.startsWith("YRS-")) return `/kb#${id}`;
  if (id.startsWith("INS-")) return `/pemeriksaan#${id}`;
  return `/pustaka#${id}`;
}

/** Turns document IDs in an answer into clickable chips. */
function Rich({ text }: { text: string }) {
  const parts = text.split(ID_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <Link key={i} href={hrefFor(p)} className="mx-0.5 inline-block rounded-[5px] bg-brand-soft px-1.5 py-px font-mono text-[11.5px] font-semibold text-brand hover:no-underline">{p}</Link>
        : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

/** Floating "Tanya LDMS" chat, bottom-right on every page. */
export function ChatWidget({ name, inline = false }: { name: string; inline?: boolean }) {
  const [open, setOpen] = useState(inline);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState<{ ok: boolean; reason: string | null }>({ ok: true, reason: null });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/chat").then((r) => r.json()).then((j) => {
      setMsgs((j.messages ?? []).map((m: Msg) => ({ role: m.role, content: m.content })));
      setReady({ ok: j.ready !== false, reason: j.reason ?? null });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [msgs, open]);
  useEffect(() => { if (open) field.current?.focus(); }, [open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: q }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Gagal (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
      }
      if (!acc.trim()) setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: "Maaf, belum ada jawaban. Coba ulangi pertanyaannya." }]);
    } catch (e) {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠ ${e instanceof Error ? e.message : "Gagal menghubungi AI."}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await fetch("/api/chat", { method: "DELETE" });
    setMsgs([]);
  }


  const panel = (
    <div className={cx("flex flex-col overflow-hidden bg-surface", inline ? "card h-[calc(100dvh-170px)] min-h-[480px]" : "fixed right-4 bottom-[148px] z-50 h-[min(620px,calc(100dvh-170px))] w-[min(400px,calc(100vw-32px))] rounded-2xl border border-line shadow-[var(--shadow-float)] md:right-6 md:bottom-24 md:h-[min(620px,calc(100dvh-120px))]")}
      role="dialog" aria-label="Tanya LDMS">
      <header className="flex items-center gap-2.5 border-b border-line-2 px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><Sparkles size={16} /></span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[14px] font-extrabold">Tanya LDMS</div>
          <div className="text-[11.5px] text-ink-3">Jawaban dari data LDMS & Google Drive tim Legal</div>
        </div>
        {msgs.length > 0 && <button type="button" onClick={reset} className="btn btn-ghost btn-sm px-2" aria-label="Mulai percakapan baru" title="Mulai baru"><RotateCcw size={16} /></button>}
        {!inline && <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-sm px-2" aria-label="Tutup chat"><X size={18} /></button>}
      </header>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {!ready.ok && <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2 text-[12.5px] text-warn">{ready.reason}</p>}
        {msgs.length === 0 && (
          <div>
            <p className="text-[13px] text-ink-2">Halo {name.split(" ")[0]}, tanya apa saja soal perizinan, agreement, sanksi, preseden, pemeriksaan, atau dokumen di Drive. ID di jawaban bisa diklik.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} disabled={busy || !ready.ok} className="rounded-lg border border-line px-3 py-2 text-left text-[12.5px] text-ink-2 hover:border-brand-line hover:bg-brand-subtle hover:text-ink disabled:opacity-50">{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap", m.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-mute-bg text-ink")}>
              {m.role === "assistant" && !m.content ? <span className="flex items-center gap-2 text-ink-3"><Loader2 size={14} className="animate-spin" /> Mencari di LDMS…</span> : m.role === "assistant" ? <Rich text={m.content} /> : m.content}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t border-line-2 p-3">
        <label htmlFor="chat-input" className="sr-only">Pertanyaan</label>
        <textarea id="chat-input" ref={field} rows={1} value={input} onChange={(e) => setInput(e.target.value)} disabled={!ready.ok}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={ready.ok ? "Tulis pertanyaan…" : "AI belum aktif"} title="Enter kirim, Shift+Enter baris baru"
          className="input max-h-32 min-h-[40px] flex-1 resize-none py-2.5" />
        <button type="submit" disabled={busy || !input.trim() || !ready.ok} className="btn btn-primary h-10 w-10 shrink-0 px-0" aria-label="Kirim">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );

  if (inline) return panel;
  return (
    <>
      {open && panel}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Tutup Tanya LDMS" : "Buka Tanya LDMS"}
        className="fixed right-4 bottom-20 z-50 flex h-14 items-center gap-2 rounded-full bg-brand px-4 text-[14px] font-bold text-white shadow-[var(--shadow-float)] transition-colors hover:bg-brand-hover md:right-6 md:bottom-6">
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        <span className="hidden sm:inline">{open ? "Tutup" : "Tanya LDMS"}</span>
      </button>
    </>
  );
}
