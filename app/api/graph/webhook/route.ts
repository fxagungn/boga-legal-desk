import { after, NextResponse, type NextRequest } from "next/server";
import { clientState, graphConfigured } from "@/lib/graph";
import { ingestGraphById } from "@/lib/jobs";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Subscription validation handshake: echo the token as text/plain within 10s.
  const token = req.nextUrl.searchParams.get("validationToken");
  if (token) return new NextResponse(token, { headers: { "content-type": "text/plain" } });
  if (!graphConfigured()) return NextResponse.json({ ok: false }, { status: 503 });

  const body = (await req.json().catch(() => ({ value: [] }))) as {
    value: { clientState?: string; resourceData?: { id?: string } }[];
  };
  const ids = body.value.filter((n) => n.clientState === clientState() && n.resourceData?.id).map((n) => n.resourceData!.id!);

  // Graph wants a fast 202; do the work after responding.
  after(async () => {
    for (const id of ids) {
      try {
        await ingestGraphById(id);
      } catch (e) {
        console.error("webhook ingest failed", id, e);
      }
    }
  });
  return new NextResponse(null, { status: 202 });
}
