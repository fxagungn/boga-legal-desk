// Working-day math in Asia/Jakarta (UTC+7, no DST).
const OFFSET = 7 * 3600_000;
const DAY = 86_400_000;

/** YYYY-MM-DD for an instant, in WIB. */
export function wibDate(d: Date | number): string {
  return new Date(+d + OFFSET).toISOString().slice(0, 10);
}

/** Start of the WIB day containing `d`, as a UTC instant. */
function wibDayStart(d: number): number {
  return Math.floor((d + OFFSET) / DAY) * DAY - OFFSET;
}

function isWorkday(dayStart: number, holidays: Set<string>): boolean {
  const local = new Date(dayStart + OFFSET);
  const dow = local.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(local.toISOString().slice(0, 10));
}

/** Fractional working days between two instants (weekends & holidays don't count). */
export function workdaysBetween(from: number, to: number, holidays: Set<string>): number {
  if (to <= from) return 0;
  let total = 0;
  let cursor = from;
  // guard against absurd ranges
  for (let i = 0; i < 2000 && cursor < to; i++) {
    const dayStart = wibDayStart(cursor);
    const dayEnd = dayStart + DAY;
    const segEnd = Math.min(dayEnd, to);
    if (isWorkday(dayStart, holidays)) total += (segEnd - cursor) / DAY;
    cursor = segEnd;
  }
  return total;
}

/** Add fractional working days to an instant. */
export function addWorkdays(from: number, days: number, holidays: Set<string>): number {
  let remaining = days;
  let cursor = from;
  for (let i = 0; i < 2000 && remaining > 1e-9; i++) {
    const dayStart = wibDayStart(cursor);
    const dayEnd = dayStart + DAY;
    if (!isWorkday(dayStart, holidays)) {
      cursor = dayEnd;
      continue;
    }
    const avail = (dayEnd - cursor) / DAY;
    if (avail >= remaining) return cursor + remaining * DAY;
    remaining -= avail;
    cursor = dayEnd;
  }
  return cursor;
}

/** Calendar days from today (WIB) to a YYYY-MM-DD date. Negative = past. */
export function daysUntil(date: string, now = Date.now()): number {
  const today = Date.parse(wibDate(now) + "T00:00:00Z");
  const target = Date.parse(date + "T00:00:00Z");
  return Math.round((target - today) / DAY);
}

const fmtDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const fmtShort = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const fmtDateTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export const formatDate = (d: Date | string | number) => fmtDate.format(new Date(typeof d === "string" && d.length === 10 ? d + "T05:00:00Z" : d));
export const formatShort = (d: Date | string | number) => fmtShort.format(new Date(typeof d === "string" && d.length === 10 ? d + "T05:00:00Z" : d));
export const formatDateTime = (d: Date | string | number) => fmtDateTime.format(new Date(d));

export function relativeDays(n: number): string {
  if (n === 0) return "hari ini";
  if (n === 1) return "besok";
  if (n === -1) return "kemarin";
  return n > 0 ? `${n} hari lagi` : `${-n} hari lewat`;
}

export function timeAgo(d: Date | string | number, now = Date.now()): string {
  const s = Math.max(0, (now - +new Date(d)) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}
