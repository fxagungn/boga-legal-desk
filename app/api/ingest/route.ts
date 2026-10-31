// Generic intake endpoint, e.g. for a Power Automate "HTTP" action or any email-forwarding service.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ingestEmail } from "@/lib/ingest";
import { safeEqual } from "@/lib/auth";

export const maxDuration = 120;

const Body = z.object({
  subject: z.string(),
  from: z.string().optional(),
  fromName: z.string().optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  body: z.string().default(""),
  receivedAt: z.string().optional(),
  messageId: z.string().optional(),
  conversationId: z.string().optional(),
  attachments: z.array(z.object({ name: z.string(), contentType: z.string().optional(), contentBase64: z.string() })).default([]),
});

const list = (v?: string | string[]) => (Array.isArray(v) ? v : (v ?? "").split(/[;,]/)).map((s) => s.trim()).filter(Boolean);

export async function POST(req: NextRequest) {
  const token = process.env.INGEST_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || !safeEqual(auth, `Bearer ${token}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const b = parsed.data;
  const r = await ingestEmail({
    source: "webhook",
    messageId: b.messageId?.replace(/[<>]/g, "") ?? null,
    threadKey: b.conversationId ? `conv:${b.conversationId}` : null,
    subject: b.subject,
    fromName: b.fromName ?? null,
    fromEmail: b.from ?? null,
    to: list(b.to),
    cc: list(b.cc),
    receivedAt: b.receivedAt ?? new Date().toISOString(),
    body: b.body,
    attachments: b.attachments.map((a) => ({ name: a.name, contentType: a.contentType ?? "application/octet-stream", data: new Uint8Array(Buffer.from(a.contentBase64, "base64")) })),
  });
  return NextResponse.json(r);
}
