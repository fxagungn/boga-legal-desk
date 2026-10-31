import { NextResponse, type NextRequest } from "next/server";
import { ingestEmail } from "@/lib/ingest";
import { parseEml, parseMsg } from "@/lib/mailparse";
import { currentMember } from "@/lib/repo";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const me = await currentMember();
  if (!me || me.must_change_password) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const results = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const name = f.name.toLowerCase();
      const email = name.endsWith(".msg") ? await parseMsg(buf) : await parseEml(buf);
      const r = await ingestEmail(email, { force: true });
      results.push({ file: f.name, subject: email.subject, ...r });
    } catch (e) {
      results.push({ file: f.name, outcome: "error", detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
