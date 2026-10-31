// Plain-language labels. The UI never shows internal codes (SLA, P1, stage keys).
import type { PriorityLevel } from "./insight";

export const PRIORITY: Record<PriorityLevel, { label: string; className: string; hint: string }> = {
  P1: { label: "Mendesak", className: "bg-brand text-white", hint: "Kerjakan hari ini" },
  P2: { label: "Tinggi", className: "bg-brand-soft text-brand-deep", hint: "Jadwalkan minggu ini" },
  P3: { label: "Normal", className: "bg-mute-bg text-ink-2", hint: "Antrean biasa" },
  P4: { label: "Rendah", className: "bg-mute-bg text-ink-3", hint: "Bisa menunggu" },
};

/** "2 hari", "½ hari", "kurang dari 1 jam" — working days rendered for humans. */
export function days(n: number): string {
  if (n < 0.04) return "baru saja";
  if (n < 0.45) return "kurang dari ½ hari";
  if (n < 0.95) return "½ hari";
  const r = Math.round(n);
  return `${r} hari`;
}

export const lateText = (over: number) => (over < 0.45 ? "Lewat target" : `Terlambat ${days(over)}`);
export const leftText = (left: number) => (left < 0.45 ? "Target hari ini" : `Sisa ${days(left)}`);

export function deadlineText(d: number | null): string {
  if (d === null) return "Tanpa deadline";
  if (d === 0) return "Deadline hari ini";
  if (d === 1) return "Deadline besok";
  if (d < 0) return `Deadline lewat ${-d} hari`;
  return `Deadline ${d} hari lagi`;
}

export const firstName = (n?: string | null) => (n ? n.split(/\s+/)[0] : "");
