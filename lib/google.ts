// Minimal Google API client using a service account (no SDK). Used for the employee sheet and, later, the KB Google Doc.
import { createSign } from "node:crypto";

interface ServiceAccount { client_email: string; private_key: string }

function account(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) return null;
    return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, "\n") };
  } catch {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64 JSON)");
    return null;
  }
}

export const googleConfigured = () => account() !== null;
export const googleAccountEmail = () => account()?.client_email ?? null;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
let cached: { token: string; exp: number; scope: string } | null = null;

async function accessToken(scope: string): Promise<string> {
  if (cached && cached.scope === scope && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = account();
  if (!sa) throw new Error("Service account Google belum diset (GOOGLE_SERVICE_ACCOUNT_JSON).");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Login Google gagal: ${j.error_description ?? res.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, scope };
  return j.access_token;
}

/** Read a range with raw values (dates as serial numbers, so birth dates parse reliably). */
export async function readSheet(spreadsheetId: string, range: string): Promise<unknown[][]> {
  const token = await accessToken("https://www.googleapis.com/auth/spreadsheets.readonly");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 403 || res.status === 404) {
    throw new Error(`Sheet tidak bisa dibaca (${res.status}). Pastikan sheet di-share (Viewer) ke ${googleAccountEmail()}.`);
  }
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { values?: unknown[][] }).values ?? [];
}
