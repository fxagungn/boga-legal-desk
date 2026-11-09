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

/* ---------- Drive, Sheets & Docs (LDMS repository in a Shared Drive) ---------- */

const RW = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/documents";

async function gfetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(RW);
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) }, cache: "no-store" });
  if (res.status === 403 || res.status === 404) {
    throw new Error(`Google ${res.status}: file/folder tidak bisa diakses. Pastikan sudah di-share (Editor) ke ${googleAccountEmail()}. ${(await res.text()).slice(0, 160)}`);
  }
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("json") ? await res.json() : await res.text()) as T;
}

/** Folder / file id from a Drive URL (or the id itself). */
export function driveIdFromUrl(url: string): string {
  const s = url.trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) || s.match(/\/d\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : /^[\w-]{10,}$/.test(s) ? s : "";
}

export interface DriveFile { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string; path: string }

export async function driveGet(id: string) {
  return gfetch<{ id: string; name: string; mimeType: string; driveId?: string; webViewLink?: string }>(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,driveId,webViewLink&supportsAllDrives=true`,
  );
}

/** Every file under a folder (recursive, max depth 4). */
export async function driveListFolder(folderId: string, path = "", depth = 0): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const r = await gfetch<{ files: Omit<DriveFile, "path">[]; nextPageToken?: string }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    for (const f of r.files) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        if (depth < 4) out.push(...(await driveListFolder(f.id, `${path}${f.name}/`, depth + 1)));
      } else out.push({ ...f, path: `${path}${f.name}` });
    }
    pageToken = r.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

/** Plain text of a Google Doc, Sheet (all tabs as CSV-ish lines) or text file. Other types return null. */
export async function driveText(f: Pick<DriveFile, "id" | "mimeType">): Promise<string | null> {
  if (f.mimeType === "application/vnd.google-apps.document") {
    return gfetch<string>(`https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=text/plain&supportsAllDrives=true`);
  }
  if (f.mimeType === "application/vnd.google-apps.spreadsheet") {
    const meta = await gfetch<{ sheets: { properties: { title: string } }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}?fields=sheets.properties.title`);
    const parts: string[] = [];
    for (const s of meta.sheets.slice(0, 20)) {
      const v = await gfetch<{ values?: unknown[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${f.id}/values/${encodeURIComponent(`'${s.properties.title}'!A1:Z2000`)}`);
      parts.push(`## ${s.properties.title}\n` + (v.values ?? []).map((r) => r.map((c) => String(c ?? "")).join(" | ")).join("\n"));
    }
    return parts.join("\n\n");
  }
  if (f.mimeType.startsWith("text/")) {
    return gfetch<string>(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`);
  }
  return null;
}

/** Create an empty Google Sheet / Doc in a (Shared Drive) folder. */
export async function driveCreate(name: string, mimeType: "application/vnd.google-apps.spreadsheet" | "application/vnd.google-apps.document", parentId: string) {
  return gfetch<{ id: string; webViewLink?: string }>(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType, parents: [parentId] }),
  });
}

/** Overwrite whole tabs of a spreadsheet (creates missing tabs). */
export async function sheetsWriteTabs(spreadsheetId: string, tabs: { title: string; rows: (string | number | null)[][] }[]) {
  const meta = await gfetch<{ sheets: { properties: { title: string } }[] }>(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
  const have = new Set(meta.sheets.map((s) => s.properties.title));
  const add = tabs.filter((t) => !have.has(t.title)).map((t) => ({ addSheet: { properties: { title: t.title } } }));
  if (add.length) await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: add }) });
  await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
    method: "POST", body: JSON.stringify({ ranges: tabs.map((t) => `'${t.title}'`) }),
  });
  await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data: tabs.map((t) => ({ range: `'${t.title}'!A1`, values: t.rows.map((r) => r.map((c) => (c === null ? "" : c))) })) }),
  });
}

export interface DocParagraph { text: string; style: string }

/** Paragraphs of a Google Doc with their named style (HEADING_1, HEADING_2, NORMAL_TEXT …). */
export async function docsParagraphs(docId: string): Promise<{ paragraphs: DocParagraph[]; revisionId: string; endIndex: number }> {
  type El = { endIndex?: number; paragraph?: { paragraphStyle?: { namedStyleType?: string }; elements?: { textRun?: { content?: string } }[] } };
  const d = await gfetch<{ revisionId: string; body: { content: El[] } }>(`https://docs.googleapis.com/v1/documents/${docId}`);
  const paragraphs: DocParagraph[] = [];
  let endIndex = 1;
  for (const el of d.body.content) {
    endIndex = Math.max(endIndex, el.endIndex ?? 1);
    if (!el.paragraph) continue;
    const text = (el.paragraph.elements ?? []).map((e) => e.textRun?.content ?? "").join("").replace(/\n$/, "");
    paragraphs.push({ text, style: el.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT" });
  }
  return { paragraphs, revisionId: d.revisionId, endIndex };
}

/** Append paragraphs (with heading styles) to the end of a Google Doc. */
export async function docsAppend(docId: string, blocks: DocParagraph[]) {
  const { endIndex } = await docsParagraphs(docId);
  let at = Math.max(1, endIndex - 1);
  const requests: unknown[] = [];
  for (const b of blocks) {
    const text = b.text.replace(/\n+$/, "") + "\n";
    requests.push({ insertText: { location: { index: at }, text } });
    requests.push({ updateParagraphStyle: { range: { startIndex: at, endIndex: at + text.length }, paragraphStyle: { namedStyleType: b.style }, fields: "namedStyleType" } });
    at += text.length;
  }
  await gfetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}
