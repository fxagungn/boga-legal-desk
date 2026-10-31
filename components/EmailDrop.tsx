"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

type Result = { file: string; subject?: string; outcome: string; documentId?: number; detail?: string };
const OUTCOME: Record<string, string> = { created: "Dokumen baru dibuat", updated: "Ditautkan ke dokumen yang ada", duplicate: "Sudah pernah dimasukkan", ignored: "Diabaikan", error: "Gagal dibaca" };

export function EmailDrop() {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function send(files: FileList | File[]) {
    const list = [...files].filter((f) => /\.(eml|msg)$/i.test(f.name));
    if (!list.length) return setError("Pilih file .msg (seret dari Outlook) atau .eml.");
    const big = list.find((f) => f.size > 4_300_000);
    if (big) return setError(`${big.name} lebih dari 4 MB. Teruskan email itu ke mailbox legal agar disinkron otomatis.`);
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/intake/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(res.status === 413 ? "File terlalu besar." : `Server menolak (${res.status}).`);
      const j = await res.json();
      setResults(j.results);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unggah gagal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${over ? "border-brand bg-brand-subtle" : "border-line bg-bg hover:border-ink-3"}`}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-subtle text-brand"><Upload size={22} /></span>
        <span className="text-[16px] font-bold">{busy ? "Membaca email & lampiran…" : "Seret email ke sini, atau klik untuk memilih"}</span>
        <span className="max-w-md text-[13.5px] text-ink-2">File .msg atau .eml. Isi email dan lampiran dibaca otomatis, lalu dibuatkan dokumen baru, atau ditautkan ke dokumen yang sudah ada kalau itu balasan.</span>
      </button>
      <input ref={input} type="file" accept=".eml,.msg" multiple hidden onChange={(e) => e.target.files && send(e.target.files)} />
      {error && <p className="mt-2 rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-4 divide-y divide-line-2 rounded-xl border border-line">
          {results.map((r, k) => (
            <li key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]">
              <div className="min-w-0">
                <div className="truncate font-semibold">{r.subject ?? r.file}</div>
                <div className={r.outcome === "error" ? "text-bad" : "text-ink-2"}>{OUTCOME[r.outcome] ?? r.outcome}{r.detail ? `: ${r.detail}` : ""}</div>
              </div>
              {r.documentId && <Link href={`/documents/${r.documentId}`} className="btn btn-sm shrink-0">Buka</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
