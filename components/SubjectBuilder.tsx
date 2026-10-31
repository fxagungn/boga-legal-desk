"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Helps requesters write a subject line the system understands. */
export function SubjectBuilder({ keyword, mailbox }: { keyword: string; mailbox: string | null }) {
  const [type, setType] = useState("VENDOR");
  const [title, setTitle] = useState("");
  const [party, setParty] = useState("");
  const [deadline, setDeadline] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [copied, setCopied] = useState(false);
  const subject = `${keyword}[${type}]${urgent ? "[URGENT]" : ""}${deadline ? `[DL:${deadline}]` : ""} ${title || "Judul dokumen"}${party ? ` - ${party}` : " - Nama Pihak Lawan"}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sb-type">Jenis dokumen</label>
          <select id="sb-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="VENDOR">Kontrak vendor</option>
            <option value="PRINSIPAL">Kontrak prinsipal</option>
            <option value="LAIN">Dokumen lain</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sb-dl">Deadline (opsional)</label>
          <input id="sb-dl" type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sb-title">Judul dokumen</label>
          <input id="sb-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Perjanjian Supply Ayam 2027" />
        </div>
        <div>
          <label className="label" htmlFor="sb-party">Pihak lawan</label>
          <input id="sb-party" className="input" value={party} onChange={(e) => setParty(e.target.value)} placeholder="PT Contoh Jaya" />
        </div>
      </div>
      <label className="flex items-center gap-2.5 text-[14px] font-semibold"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-4 w-4 accent-[#c0272d]" /> Urgent</label>
      <div className="rounded-xl border border-line bg-bg p-3">
        <p className="mb-1 text-[12.5px] font-semibold text-ink-3">Subjek email</p>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 text-[14px] font-semibold break-words text-ink">{subject}</code>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => { navigator.clipboard?.writeText(subject); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          >
            {copied ? <><Check size={14} /> Tersalin</> : <><Copy size={14} /> Salin</>}
          </button>
        </div>
      </div>
      <p className="text-[13px] text-ink-2">
        Kirim email dengan subjek ini {mailbox ? <>ke <b>{mailbox}</b></> : "ke mailbox legal (atau CC)"}, lampirkan draft dokumennya. Dokumen otomatis muncul di Legal Desk dan PIC langsung ditugaskan.
      </p>
    </div>
  );
}
