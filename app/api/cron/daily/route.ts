import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { setKV } from "@/lib/db";

export const maxDuration = 300;

/** Daily job (Vercel Hobby: one cron). Order follows blueprint §14.2: sync → KB → reminders → Drive. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[`${name}Error`] = e instanceof Error ? e.message : String(e);
    }
  };

  const { employeeSyncConfigured, applySync } = await import("@/lib/employees");
  if (employeeSyncConfigured()) await step("employees", () => applySync());

  const drive = await import("@/lib/drive");
  const { getFlows } = await import("@/lib/flows");
  const flows = await getFlows();
  if (flows.drive.kbDocId) await step("kb", () => drive.syncKbFromDocs());

  const { runScan, weeklyDigest } = await import("@/lib/ldms/reminders");
  await step("reminders", () => runScan(null, "send"));
  const dow = new Date(Date.now() + 7 * 3600_000).getUTCDay();
  if (dow === 1 && flows.reminder.digestEnabled) out.digest = await weeklyDigest();

  if (flows.drive.folderId) {
    await step("driveIndex", () => drive.indexDrive());
    await step("driveMirror", () => drive.mirrorToDrive());
  }
  const { purgeOldFiles } = await import("@/lib/ldms/retention");
  await step("fileRetention", () => purgeOldFiles());

  await setKV("last_daily", { at: new Date().toISOString() });
  return NextResponse.json(out);
}
