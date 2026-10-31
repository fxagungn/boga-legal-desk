// Microsoft Graph (app-only / client credentials) for the shared legal mailbox.
import { getKV, setKV } from "./db";

const G = "https://graph.microsoft.com/v1.0";

export const graphConfigured = () =>
  Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_MAILBOX);

export const mailbox = () => process.env.MS_MAILBOX!;

let cached: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Graph token gagal: ${j.error_description || j.error || res.status}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function gfetch(path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : G + path, {
    ...init,
    headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Graph ${res.status}: ${t.slice(0, 300)}`);
  }
  return res;
}

export interface GraphMessage {
  id: string;
  subject: string | null;
  conversationId: string | null;
  internetMessageId: string | null;
  receivedDateTime: string;
  hasAttachments: boolean;
  from?: { emailAddress: { name: string; address: string } };
  toRecipients?: { emailAddress: { name: string; address: string } }[];
  ccRecipients?: { emailAddress: { name: string; address: string } }[];
  body?: { contentType: string; content: string };
  uniqueBody?: { contentType: string; content: string };
}

const SELECT = "id,subject,conversationId,internetMessageId,receivedDateTime,hasAttachments,from,toRecipients,ccRecipients,body,uniqueBody";

export async function listRecentMessages(sinceIso: string): Promise<GraphMessage[]> {
  const out: GraphMessage[] = [];
  let url: string | null =
    `${G}/users/${encodeURIComponent(mailbox())}/messages?$select=${SELECT}&$top=50&$orderby=receivedDateTime desc` +
    `&$filter=receivedDateTime ge ${sinceIso}`;
  for (let i = 0; url && i < 6; i++) {
    const res = await gfetch(url, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    const j: { value: GraphMessage[]; "@odata.nextLink"?: string } = await res.json();
    out.push(...j.value);
    url = j["@odata.nextLink"] ?? null;
  }
  return out;
}

export async function getMessage(id: string): Promise<GraphMessage> {
  const res = await gfetch(`/users/${encodeURIComponent(mailbox())}/messages/${id}?$select=${SELECT}`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  return res.json();
}

export async function getAttachments(id: string): Promise<{ name: string; contentType: string; data: Uint8Array }[]> {
  const base = `/users/${encodeURIComponent(mailbox())}/messages/${id}/attachments`;
  const res = await gfetch(`${base}?$select=id,name,contentType,size,isInline`);
  const j: { value: { id: string; name: string; contentType: string; size: number; isInline: boolean; "@odata.type": string }[] } = await res.json();
  const files = j.value.filter((a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && !a.isInline && a.size < 25_000_000);
  const out = [];
  for (const a of files) {
    const r = await gfetch(`${base}/${a.id}/$value`, { headers: { "content-type": "application/octet-stream" } });
    out.push({ name: a.name, contentType: a.contentType || "application/octet-stream", data: new Uint8Array(await r.arrayBuffer()) });
  }
  return out;
}

export async function sendMail(to: string[], subject: string, html: string) {
  await gfetch(`/users/${encodeURIComponent(mailbox())}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: to.map((address) => ({ emailAddress: { address } })) },
      saveToSentItems: false,
    }),
  });
}

/* ---------- change notifications (webhook) ---------- */

interface SubState { id: string; expiration: string }

export function clientState() {
  return process.env.GRAPH_CLIENT_STATE || (process.env.AUTH_SECRET ?? "legal-desk").slice(0, 32);
}

export async function ensureSubscription(appUrl: string): Promise<SubState> {
  const exp = new Date(Date.now() + 2.9 * 86_400_000).toISOString();
  const current = await getKV<SubState>("graph_subscription");
  if (current) {
    try {
      const res = await gfetch(`/subscriptions/${current.id}`, { method: "PATCH", body: JSON.stringify({ expirationDateTime: exp }) });
      const j = await res.json();
      const s = { id: j.id, expiration: j.expirationDateTime };
      await setKV("graph_subscription", s);
      return s;
    } catch {
      /* expired or deleted — create a new one */
    }
  }
  const res = await gfetch(`/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: `${appUrl}/api/graph/webhook`,
      resource: `users/${mailbox()}/mailFolders('Inbox')/messages`,
      expirationDateTime: exp,
      clientState: clientState(),
    }),
  });
  const j = await res.json();
  const s = { id: j.id, expiration: j.expirationDateTime };
  await setKV("graph_subscription", s);
  return s;
}
