import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PARAMS = { N: 16384, r: 8, p: 1 };

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(pw, salt, 32, PARAMS).toString("base64")}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  // "scrypt$salt$hash" (app) or "scrypt:salt:hash" (env seed; "$" gets mangled by some env loaders)
  const [algo, salt, hash] = stored.split(/[$:]/);
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = scryptSync(pw, Buffer.from(salt, "base64"), expected.length, PARAMS);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Birth date (YYYY-MM-DD from a date input) to the initial password format DDMMYYYY. */
export function birthPassword(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Tanggal lahir tidak valid.");
  return `${m[3]}${m[2]}${m[1]}`;
}

export function passwordProblem(pw: string, nik: string | null): string | null {
  if (pw.length < 8) return "Password minimal 8 karakter.";
  if (/^\d{8}$/.test(pw)) return "Jangan pakai tanggal lahir atau 8 angka saja.";
  if (nik && pw.toUpperCase().includes(nik.toUpperCase())) return "Password tidak boleh memuat NIK.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Gunakan kombinasi huruf dan angka.";
  return null;
}
