// Email (Microsoft Graph or Resend) and WhatsApp (Fonnte or Meta Cloud API) notifications.
import { query } from "./db";
import { graphConfigured, sendMail } from "./graph";
import type { Member } from "./repo";

export const appUrl = () =>
  (process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");

export const emailChannel = (): "graph" | "resend" | null =>
  graphConfigured() && process.env.MS_SEND_MAIL !== "false" ? "graph" : process.env.RESEND_API_KEY ? "resend" : null;

export const waChannel = (): "fonnte" | "meta" | null =>
  process.env.FONNTE_TOKEN ? "fonnte" : process.env.WA_META_TOKEN && process.env.WA_META_PHONE_ID ? "meta" : null;

export interface Message {
  kind: string;
  documentId?: number | null;
  subject: string;
  /** Plain lines; first line is the headline. */
  lines: string[];
  link?: string;
  dedupeKey?: string;
}

function html(m: Message) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1b2a3a;max-width:560px">
    <p style="font-size:16px;font-weight:600;margin:0 0 12px">${esc(m.lines[0] ?? m.subject)}</p>
    ${m.lines.slice(1).map((l) => `<p style="margin:0 0 6px">${esc(l)}</p>`).join("")}
    ${m.link ? `<p style="margin:18px 0"><a href="${m.link}" style="background:#0f5f66;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Buka di Legal Desk</a></p>` : ""}
    <p style="color:#6b7785;font-size:12px;margin-top:24px">Notifikasi otomatis Legal Desk.</p></div>`;
}

const normalizePhone = (p: string) => {
  const d = p.replace(/[^\d]/g, "");
  return d.startsWith("0") ? "62" + d.slice(1) : d;
};

async function sendEmail(to: string, m: Message) {
  const ch = emailChannel();
  if (ch === "graph") return sendMail([to], m.subject, html(m));
  if (ch === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "Legal Desk <onboarding@resend.dev>", to: [to], subject: m.subject, html: html(m) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function sendWa(to: string, m: Message) {
  const text = [`*${m.lines[0] ?? m.subject}*`, ...m.lines.slice(1), m.link ? `\n${m.link}` : ""].join("\n").trim();
  const ch = waChannel();
  if (ch === "fonnte") {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { authorization: process.env.FONNTE_TOKEN! },
      body: new URLSearchParams({ target: normalizePhone(to), message: text, countryCode: "62" }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.status === false) throw new Error(`Fonnte: ${j.reason || res.status}`);
  } else if (ch === "meta") {
    // Meta Cloud API: free-form text only works inside a 24h session; set WA_META_TEMPLATE for template messages.
    const tpl = process.env.WA_META_TEMPLATE;
    const body = tpl
      ? { messaging_product: "whatsapp", to: normalizePhone(to), type: "template", template: { name: tpl, language: { code: process.env.WA_META_TEMPLATE_LANG || "id" }, components: [{ type: "body", parameters: [{ type: "text", text: text.slice(0, 1000) }] }] } }
      : { messaging_product: "whatsapp", to: normalizePhone(to), type: "text", text: { body: text } };
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WA_META_PHONE_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.WA_META_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

/** Send a message to members over every configured channel. Never throws. */
export async function notify(members: Member[], m: Message): Promise<number> {
  let sent = 0;
  const targets: { channel: "email" | "whatsapp"; to: string }[] = [];
  for (const mem of members) {
    if (mem.email && emailChannel()) targets.push({ channel: "email", to: mem.email });
    if (mem.whatsapp && waChannel()) targets.push({ channel: "whatsapp", to: mem.whatsapp });
  }
  for (const t of targets) {
    const key = m.dedupeKey ? `${m.dedupeKey}:${t.channel}:${t.to}` : null;
    if (key) {
      const ins = await query(`insert into notifications (document_id, channel, recipient, kind, dedupe_key, status)
        values ($1,$2,$3,$4,$5,'pending') on conflict (dedupe_key) do nothing returning id`, [m.documentId ?? null, t.channel, t.to, m.kind, key]);
      if (ins.length === 0) continue; // already sent
    }
    try {
      if (t.channel === "email") await sendEmail(t.to, m);
      else await sendWa(t.to, m);
      sent++;
      if (key) await query(`update notifications set status='sent' where dedupe_key=$1`, [key]);
      else await query(`insert into notifications (document_id, channel, recipient, kind, status) values ($1,$2,$3,$4,'sent')`, [m.documentId ?? null, t.channel, t.to, m.kind]);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("notify failed", t, err);
      if (key) await query(`update notifications set status='failed', error=$2 where dedupe_key=$1`, [key, err]);
      else await query(`insert into notifications (document_id, channel, recipient, kind, status, error) values ($1,$2,$3,$4,'failed',$5)`, [m.documentId ?? null, t.channel, t.to, m.kind, err]);
    }
  }
  return sent;
}
