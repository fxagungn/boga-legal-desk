import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { currentMember } from "@/lib/repo";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentMember())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const a = await one<{ filename: string; content_type: string; b64: string }>(
    `select filename, content_type, encode(data, 'base64') as b64 from attachments where id = $1`,
    [Number(id)],
  );
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const inline = req.nextUrl.searchParams.get("view") === "1" && a.content_type.includes("pdf");
  return new NextResponse(Buffer.from(a.b64, "base64"), {
    headers: {
      "content-type": a.content_type,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
