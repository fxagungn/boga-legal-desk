import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { setKV } from "@/lib/db";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = {};
  // Legal team from the employee sheet (new joiners get an account, resigned people lose access).
  const { employeeSyncConfigured, applySync } = await import("@/lib/employees");
  if (employeeSyncConfigured()) {
    try {
      out.employees = await applySync();
    } catch (e) {
      out.employeesError = e instanceof Error ? e.message : String(e);
    }
  }
  await setKV("last_daily", { at: new Date().toISOString() });
  return NextResponse.json(out);
}
