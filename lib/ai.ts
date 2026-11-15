// Claude via ANTHROPIC_API_KEY. Every call is written to ai_runs (blueprint AI_Audit).
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { query } from "./db";
import { getFlows } from "./flows";
import type { Member } from "./repo";

export const aiKeySet = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function aiReady(): Promise<{ ok: true; model: string } | { ok: false; reason: string }> {
  if (!aiKeySet()) return { ok: false, reason: "AI belum dikonfigurasi: isi ANTHROPIC_API_KEY di Vercel (Settings → Environment Variables), lalu redeploy." };
  const f = await getFlows();
  if (!f.ai.enabled) return { ok: false, reason: "Fitur AI sedang dimatikan oleh Super Admin (Admin Console → AI)." };
  return { ok: true, model: process.env.ANTHROPIC_MODEL || f.ai.model || "claude-sonnet-5-5" };
}

export function aiModel(modelId: string) {
  return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(modelId);
}

export async function logAi(me: Pick<Member, "id" | "name"> | null, module: string, input: unknown, output: unknown, extra: { model?: string; ok?: boolean; error?: string; confidence?: string; refs?: string[] } = {}) {
  const r = await query<{ id: string }>(
    `insert into ai_runs (module, member_id, actor, input, output, model, ok, error, confidence, refs) values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10) returning id::text`,
    [module, me?.id ?? null, me?.name ?? "Sistem", JSON.stringify(input ?? null), JSON.stringify(output ?? null), extra.model ?? null, extra.ok ?? true, extra.error ?? null, extra.confidence ?? null, extra.refs?.join(",") ?? null],
  );
  return r[0]?.id ?? null;
}

export function extractJson<T>(t: string): T {
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Respons AI tidak berisi JSON.");
  return JSON.parse(t.slice(a, b + 1)) as T;
}

/**
 * One-shot JSON call (Repository consult, inspection prep).
 * The model sometimes answers with a cut-off or non-JSON reply. So: generous token limit, one stricter retry,
 * and — when a `fallback` is given — the plain text is shown instead of an error.
 */
export async function aiJson<T>(me: Pick<Member, "id" | "name"> | null, module: string, system: string, user: string, maxOutputTokens = 6000, fallback?: (text: string) => T): Promise<{ data: T; runId: string | null }> {
  const ready = await aiReady();
  if (!ready.ok) throw new Error(ready.reason);
  const attempts: string[] = [];
  let lastText = "";
  try {
    let data: T | null = null;
    for (const [i, extra] of ["", "\n\nPENTING: balas HANYA satu objek JSON valid sesuai format, tanpa teks pembuka, tanpa markdown, dan pastikan JSON ditutup lengkap. Ringkas bila perlu."].entries()) {
      const r = await generateText({ model: aiModel(ready.model), system, prompt: user + extra, maxOutputTokens: maxOutputTokens * (i + 1) });
      lastText = r.text ?? "";
      try {
        data = extractJson<T>(lastText);
        break;
      } catch (e) {
        attempts.push(`percobaan ${i + 1}: ${e instanceof Error ? e.message : e} (finish=${r.finishReason}, ${lastText.length} karakter)`);
      }
    }
    if (data === null) {
      if (!fallback || !lastText.trim()) throw new Error(`Format jawaban AI tidak terbaca — ${attempts.join("; ")}`);
      data = fallback(lastText.trim());
    }
    const conf = (data as { keyakinan?: string }).keyakinan;
    const refs = ((data as { referensi?: { id?: string }[] }).referensi ?? []).map((x) => x.id ?? "").filter(Boolean);
    const runId = await logAi(me, module, { system: system.slice(0, 400), user: user.slice(0, 20_000) }, data, { model: ready.model, confidence: conf, refs, error: attempts.length ? attempts.join("; ").slice(0, 500) : undefined });
    return { data, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAi(me, module, { user: user.slice(0, 4000) }, lastText ? { raw: lastText.slice(0, 4000) } : null, { model: ready.model, ok: false, error: msg.slice(0, 500) });
    console.error(`[ai:${module}]`, msg);
    throw new Error("AI belum bisa menyusun rekomendasi. Coba lagi sebentar; bila berulang, cek Admin Console › AI › Log AI.");
  }
}
