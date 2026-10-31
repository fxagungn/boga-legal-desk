export function money(v: number | null, currency = "IDR") {
  if (v === null || Number.isNaN(v)) return "—";
  if (currency === "IDR") {
    if (v >= 1e12) return `Rp${(v / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 1 })} T`;
    if (v >= 1e9) return `Rp${(v / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    if (v >= 1e6) return `Rp${(v / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
    return `Rp${v.toLocaleString("id-ID")}`;
  }
  return `${currency} ${v.toLocaleString("id-ID")}`;
}

export const initials = (name?: string | null) =>
  (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
