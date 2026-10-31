// Parse .eml / .msg files dragged from Outlook, and map Graph messages.
import PostalMime from "postal-mime";
import type { IncomingEmail } from "./ingest";
import type { GraphMessage } from "./graph";
import type { FileInput } from "./ai";

const stripHtml = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();

function threadFromRefs(messageId: string | null, inReplyTo?: string | null, references?: string | null) {
  const first = references?.trim().split(/\s+/)[0] || inReplyTo?.trim() || messageId;
  return first ? `mid:${first.replace(/[<>]/g, "")}` : null;
}

export async function parseEml(buf: ArrayBuffer): Promise<IncomingEmail> {
  const m = await PostalMime.parse(buf);
  const attachments: FileInput[] = (m.attachments || [])
    .filter((a) => a.disposition !== "inline" || /\.(pdf|docx?)$/i.test(a.filename || ""))
    .map((a) => ({
      name: a.filename || "lampiran",
      contentType: a.mimeType || "application/octet-stream",
      data: typeof a.content === "string" ? new TextEncoder().encode(a.content) : new Uint8Array(a.content),
    }));
  const messageId = m.messageId?.replace(/[<>]/g, "") || null;
  return {
    source: "upload",
    messageId,
    threadKey: threadFromRefs(messageId, m.inReplyTo, m.references),
    subject: m.subject || "(tanpa subjek)",
    fromName: m.from?.name || null,
    fromEmail: m.from?.address || null,
    to: (m.to || []).map((a) => a.address || "").filter(Boolean),
    cc: (m.cc || []).map((a) => a.address || "").filter(Boolean),
    receivedAt: m.date ? new Date(m.date).toISOString() : new Date().toISOString(),
    body: m.text || (m.html ? stripHtml(m.html) : ""),
    attachments,
  };
}

export async function parseMsg(buf: ArrayBuffer): Promise<IncomingEmail> {
  const { default: MsgReader } = await import("@kenjiuno/msgreader");
  const reader = new MsgReader(buf);
  const info = reader.getFileData();
  const headers = info.headers || "";
  const header = (name: string) => headers.match(new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, "im"))?.[1]?.replace(/\r?\n[ \t]+/g, " ").trim() ?? null;
  const messageId = (info.messageId || header("Message-ID"))?.replace(/[<>]/g, "") || null;
  const attachments: FileInput[] = [];
  for (const a of info.attachments || []) {
    try {
      const f = reader.getAttachment(a);
      if (!f?.content?.length) continue;
      const name = f.fileName || a.fileName || "lampiran";
      attachments.push({ name, contentType: a.attachMimeTag || guessType(name), data: new Uint8Array(f.content) });
    } catch {
      /* skip unreadable attachment */
    }
  }
  const recips = info.recipients || [];
  return {
    source: "upload",
    messageId,
    threadKey: threadFromRefs(messageId, header("In-Reply-To"), header("References")),
    subject: info.subject || "(tanpa subjek)",
    fromName: info.senderName || null,
    fromEmail: info.senderSmtpAddress || info.senderEmail || null,
    to: recips.filter((r) => r.recipType !== "cc").map((r) => r.smtpAddress || r.email || "").filter(Boolean),
    cc: recips.filter((r) => r.recipType === "cc").map((r) => r.smtpAddress || r.email || "").filter(Boolean),
    receivedAt: info.messageDeliveryTime ? new Date(info.messageDeliveryTime).toISOString() : info.clientSubmitTime ? new Date(info.clientSubmitTime).toISOString() : new Date().toISOString(),
    body: info.body || (info.bodyHtml ? stripHtml(info.bodyHtml) : ""),
    attachments,
  };
}

function guessType(name: string) {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".doc")) return "application/msword";
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

export function fromGraph(m: GraphMessage, attachments: FileInput[]): IncomingEmail {
  const body = m.uniqueBody?.content || m.body?.content || "";
  return {
    source: "graph",
    messageId: m.internetMessageId?.replace(/[<>]/g, "") || `graph:${m.id}`,
    graphId: m.id,
    threadKey: m.conversationId ? `conv:${m.conversationId}` : null,
    subject: m.subject || "(tanpa subjek)",
    fromName: m.from?.emailAddress.name || null,
    fromEmail: m.from?.emailAddress.address || null,
    to: (m.toRecipients || []).map((r) => r.emailAddress.address),
    cc: (m.ccRecipients || []).map((r) => r.emailAddress.address),
    receivedAt: m.receivedDateTime,
    body: m.body?.contentType === "html" ? stripHtml(body) : body,
    attachments,
  };
}
