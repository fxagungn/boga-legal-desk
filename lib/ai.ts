// AI extraction via Vercel AI Gateway (OIDC on Vercel, or AI_GATEWAY_API_KEY) or a direct Anthropic key.
import { generateText, type FilePart, type TextPart } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { typeDef, type DocType, type Workflows } from "./workflow";

export const aiEnabled = () =>
  process.env.AI_DISABLED !== "true" &&
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);

function model() {
  if (process.env.ANTHROPIC_API_KEY) {
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5");
  }
  return process.env.AI_MODEL || "anthropic/claude-sonnet-5";
}

export interface FileInput { name: string; contentType: string; data: Uint8Array }

const Extract = z.object({
  title: z.string().min(1).max(200),
  doc_type: z.string(),
  counterparty: z.string().nullable(),
  contract_value: z.number().nullable(),
  currency: z.string().nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  urgent: z.boolean(),
  risk_level: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  key_points: z.array(z.string()).max(8),
  requester_name: z.string().nullable(),
});
export type Extraction = z.infer<typeof Extract>;

const Update = z.object({
  suggested_stage: z.string().nullable(),
  hold: z.boolean(),
  reason: z.string(),
});
export type UpdateSuggestion = z.infer<typeof Update>;

async function fileParts(files: FileInput[]) {
  const parts: Array<TextPart | FilePart> = [];
  let budget = 3;
  for (const f of files) {
    if (budget <= 0) break;
    const ct = f.contentType.toLowerCase();
    const name = f.name.toLowerCase();
    if ((ct.includes("pdf") || name.endsWith(".pdf")) && f.data.byteLength < 15_000_000) {
      parts.push({ type: "file", data: f.data, mediaType: "application/pdf", filename: f.name });
      budget--;
    } else if (name.endsWith(".docx") || ct.includes("wordprocessingml")) {
      try {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ buffer: Buffer.from(f.data) });
        parts.push({ type: "text", text: `--- Lampiran ${f.name} ---\n${value.slice(0, 60_000)}` });
        budget--;
      } catch (e) {
        console.error("docx extract failed", e);
      }
    } else if (ct.startsWith("text/") || name.endsWith(".txt")) {
      parts.push({ type: "text", text: `--- Lampiran ${f.name} ---\n${new TextDecoder().decode(f.data).slice(0, 30_000)}` });
      budget--;
    }
  }
  return parts;
}

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI tidak mengembalikan JSON");
  return schema.parse(JSON.parse(text.slice(start, end + 1)));
}

export async function extractFromEmail(email: { subject: string; from: string; body: string; receivedAt: string }, files: FileInput[], wf: Workflows): Promise<Extraction> {
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const prompt = `Kamu asisten tim Legal di sebuah grup perusahaan F&B di Indonesia. Dari email dan lampiran berikut, ekstrak data dokumen legal.
Tanggal hari ini (WIB): ${today}.

Balas HANYA dengan satu objek JSON, tanpa teks lain, dengan field:
- title: nama dokumen singkat & jelas dalam Bahasa Indonesia (mis. "Perjanjian Supply Ayam 2027")
- doc_type: salah satu dari ${wf.map((t) => `"${t.key}" (${t.label})`).join(", ")}. Vendor = pemasok/penyedia jasa; prinsipal = pemilik merek/lisensi/distribusi/franchise.
- counterparty: nama badan hukum pihak lawan, atau null
- contract_value: nilai kontrak total dalam angka (tanpa titik/koma), atau null jika tidak disebut
- currency: kode mata uang (IDR, USD, SGD, ...) atau null
- deadline: tanggal (YYYY-MM-DD) dokumen harus selesai/ditandatangani bila disebut atau tersirat (mis. "sebelum akhir bulan"), atau null
- urgent: true bila pengirim menekankan urgensi
- risk_level: "low" | "medium" | "high" berdasarkan klausul berisiko, nilai, dan eksposur hukum
- summary: 2-3 kalimat Bahasa Indonesia, apa yang diminta dan konteks bisnisnya
- key_points: hingga 6 poin pendek klausul penting / risiko / hal yang perlu dicek (Bahasa Indonesia)
- requester_name: nama peminta dari tim internal, atau null

EMAIL
Subjek: ${email.subject}
Dari: ${email.from}
Diterima: ${email.receivedAt}

${email.body.slice(0, 20_000)}`;

  const { text } = await generateText({
    model: model(),
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...(await fileParts(files))] }],
    maxOutputTokens: 1500,
  });
  return parseJson(text, Extract);
}

export async function suggestUpdate(
  doc: { title: string; doc_type: DocType; stage: string; status: string },
  wf: Workflows,
  email: { subject: string; from: string; body: string },
): Promise<UpdateSuggestion> {
  const stages = typeDef(wf, doc.doc_type).stages.map((s) => `${s.key} = ${s.label}`).join("\n");
  const prompt = `Dokumen legal "${doc.title}" sedang di tahap "${doc.stage}" (status ${doc.status}).
Tahapan yang tersedia:
${stages}

Email balasan baru masuk pada thread dokumen ini. Tentukan apakah email ini menandakan perpindahan tahap.
Balas HANYA JSON: {"suggested_stage": key tahap tujuan atau null bila tidak ada perubahan, "hold": true bila tim kini menunggu pihak lain (mis. menunggu markup/tanda tangan vendor), "reason": satu kalimat Bahasa Indonesia}.

Subjek: ${email.subject}
Dari: ${email.from}

${email.body.slice(0, 12_000)}`;
  const { text } = await generateText({ model: model(), prompt, maxOutputTokens: 300 });
  return parseJson(text, Update);
}
