import { NextResponse, type NextRequest } from "next/server";
import { ensureSubscription, graphConfigured } from "@/lib/graph";
import { runDaily, syncMailbox } from "@/lib/jobs";
import { appUrl } from "@/lib/notify";
import { safeEqual } from "@/lib/auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = {};
  if (graphConfigured()) {
    try {
      out.subscription = await ensureSubscription(appUrl());
    } catch (e) {
      out.subscriptionError = e instanceof Error ? e.message : String(e);
    }
    try {
      out.sync = await syncMailbox(2);
    } catch (e) {
      out.syncError = e instanceof Error ? e.message : String(e);
    }
  }
  out.daily = await runDaily();
  return NextResponse.json(out);
}
