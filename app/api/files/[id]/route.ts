import { NextResponse, type NextRequest } from "next/server";
import { one } from "@/lib/db";
import { currentMember } from "@/lib/repo";
import { can, getAccessCtx } from "@/lib/access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me || me.must_change_password) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const f = await one<{ entity: string; filename: string; content_type: string; b64: string }>(
    `select entity, filename, content_type, encode(data, 'base64') as b64 from files where id = $1`,
    [Number(id)],
  );
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!can(await getAccessCtx(), me, f.entity === "agreement" ? "agreement" : "permit", "view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const viewable = /pdf|^image\//.test(f.content_type);
  const inline = req.nextUrl.searchParams.get("view") === "1" && viewable;
  return new NextResponse(Buffer.from(f.b64, "base64"), {
    headers: {
      "content-type": f.content_type,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
