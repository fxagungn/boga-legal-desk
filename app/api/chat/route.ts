import { NextResponse, type NextRequest } from "next/server";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { query } from "@/lib/db";
import { currentMember } from "@/lib/repo";
import { can, getAccess } from "@/lib/access";
import { aiModel, aiReady, logAi } from "@/lib/ai";
import { CHAT_SYSTEM, ldmsTools } from "@/lib/chat-tools";
import { formatDate } from "@/lib/time";

export const maxDuration = 60;

async function me() {
  const m = await currentMember();
  if (!m || m.must_change_password) return null;
  return can(await getAccess(), m, "chat", "view") ? m : null;
}

/** History for the floating chat (last 40 messages). */
export async function GET() {
  const m = await me();
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await query<{ id: number; role: string; content: string; created_at: string }>(
    `select * from (select id, role, content, created_at from chat_messages where member_id = $1 order by id desc limit 40) x order by id`, [m.id],
  );
  const ready = await aiReady();
  return NextResponse.json({ messages: rows, ready: ready.ok, reason: ready.ok ? null : ready.reason });
}

export async function DELETE() {
  const m = await me();
  if (!m) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await query(`delete from chat_messages where member_id = $1`, [m.id]);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const m = await me();
  if (!m) return NextResponse.json({ error: "Sesi berakhir atau akses Tanya LDMS tidak diizinkan." }, { status: 401 });
  const { message } = (await req.json().catch(() => ({}))) as { message?: string };
  const text = String(message ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "Pertanyaan kosong." }, { status: 400 });
  const ready = await aiReady();
  if (!ready.ok) return NextResponse.json({ error: ready.reason }, { status: 503 });

  // Blueprint §12.2: the last 7 messages travel with the question.
  const history = await query<{ role: "user" | "assistant"; content: string }>(
    `select role, content from (select id, role, content from chat_messages where member_id = $1 order by id desc limit 6) x order by id`, [m.id],
  );
  await query(`insert into chat_messages (member_id, role, content) values ($1,'user',$2)`, [m.id, text]);
  const messages: ModelMessage[] = [...history.map((h) => ({ role: h.role, content: h.content }) as ModelMessage), { role: "user", content: text }];
  const used: string[] = [];

  const result = streamText({
    model: aiModel(ready.model),
    system: CHAT_SYSTEM(m.name, formatDate(Date.now())),
    messages,
    tools: ldmsTools(),
    stopWhen: stepCountIs(6),
    maxOutputTokens: 1200,
    onToolExecutionEnd: ({ toolCall }) => { used.push(toolCall.toolName); },
    onEnd: async ({ text: answer }) => {
      const out = answer.trim() || "Maaf, saya belum bisa menjawab. Coba ulangi pertanyaannya.";
      await query(`insert into chat_messages (member_id, role, content) values ($1,'assistant',$2)`, [m.id, out]);
      await logAi(m, "chat", { question: text }, { answer: out, tools: used }, { model: ready.model });
    },
    onError: async ({ error }) => {
      await logAi(m, "chat", { question: text }, null, { model: ready.model, ok: false, error: String(error).slice(0, 400) });
    },
  });
  return result.toTextStreamResponse();
}
