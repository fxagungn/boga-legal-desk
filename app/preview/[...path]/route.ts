// Serves the LDMS design prototype (data contoh) for screens that are not built yet. Admin only.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentMember } from "@/lib/repo";
import { canPreview } from "@/lib/nav";

const FILES: Record<string, string> = {
  "ldms.html": "text/html; charset=utf-8",
  "support.js": "text/javascript; charset=utf-8",
  "vendor/react.production.min.js": "text/javascript; charset=utf-8",
  "vendor/react-dom.production.min.js": "text/javascript; charset=utf-8",
  "vendor/babel.min.js": "text/javascript; charset=utf-8",
};

export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const type = FILES[rel];
  if (!type) return new NextResponse("Not found", { status: 404 });
  const me = await currentMember();
  if (!me || !canPreview(me.role)) return new NextResponse("Forbidden", { status: 403 });
  const body = await readFile(path.join(process.cwd(), "preview", rel));
  return new NextResponse(body, {
    headers: { "content-type": type, "cache-control": "private, max-age=300", "x-robots-tag": "noindex" },
  });
}
