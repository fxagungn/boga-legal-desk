// Deterministic subject parsing. Explicit tags always win over AI guesses.
//
// Format:  [LEGAL][VENDOR|PRINSIPAL|LAIN][URGENT][DL:2026-11-20] Judul dokumen - PT Pihak Lawan
// Replies: RE: / FW: / Balas: / Teruskan: prefixes are ignored. A code like LGL-2026-0012 links the email to a document.

import type { DocType, Workflows } from "./workflow";

export interface ParsedSubject {
  matched: boolean;
  docType: DocType | null;
  urgent: boolean;
  deadline: string | null;
  title: string;
  counterparty: string | null;
  code: string | null;
  normalized: string;
}

const PREFIX = /^\s*((re|fw|fwd|aw|wg|balas|teruskan|tr)\s*:\s*)+/i;

export function stripPrefixes(s: string) {
  return s.replace(PREFIX, "").trim();
}

export function normalizeSubject(s: string) {
  return stripPrefixes(s)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bLGL-\d{4}-\d{3,}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseDate(v: string): string | null {
  v = v.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseSubject(subject: string, keywords: string[], wf: Workflows): ParsedSubject {
  const s = stripPrefixes(subject || "");
  const upper = (subject || "").toUpperCase();
  const matched = keywords.some((k) => k.trim() && upper.includes(k.trim().toUpperCase()));
  const tags = [...s.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());

  let docType: DocType | null = null;
  let urgent = false;
  let deadline: string | null = null;
  for (const t of tags) {
    const u = t.toUpperCase();
    const byTag = wf.find((t) => t.tag === u.replace(/[^A-Z0-9]/g, ""));
    if (byTag) docType = byTag.key;
    else if (["SUPPLIER", "PEMASOK"].includes(u) && wf.some((t) => t.key === "vendor")) docType = "vendor";
    else if (["PRINCIPAL", "LISENSI", "FRANCHISE", "DISTRIBUSI"].includes(u) && wf.some((t) => t.key === "principal")) docType = "principal";
    else if (["URGENT", "SEGERA", "PENTING"].includes(u)) urgent = true;
    else {
      const dl = u.match(/^(DL|DEADLINE|TENGGAT)\s*[: ]\s*(.+)$/);
      if (dl) deadline = parseDate(dl[2]);
    }
  }

  const code = (subject.match(/\bLGL-\d{4}-\d{3,}\b/i)?.[0] ?? null)?.toUpperCase() ?? null;
  const rest = s.replace(/\[[^\]]*\]/g, " ").replace(/\bLGL-\d{4}-\d{3,}\b/gi, " ").replace(/\s+/g, " ").trim();
  const dash = rest.split(/\s[-–—|]\s/);
  const title = (dash.length > 1 ? dash.slice(0, -1).join(" - ") : rest) || "Dokumen tanpa judul";
  const counterparty = dash.length > 1 ? dash[dash.length - 1].trim() : null;

  return { matched, docType, urgent, deadline, title, counterparty, code, normalized: normalizeSubject(subject) };
}
