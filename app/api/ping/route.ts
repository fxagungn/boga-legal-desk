import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Latency probe (no data): where the function runs, which region the database is in, and how long
 * a database round trip takes. Used to tune the Vercel function region.
 */
export async function GET() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const dbRegion = url.match(/\.([a-z]{2}-[a-z]+-\d)\.(?:aws|azure)\.neon\.tech/)?.[1] ?? url.match(/\.(?:c-\d\.)?([a-z]+-[a-z]+\d?)\.azure/)?.[1] ?? "unknown";
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await query(`select 1`);
    times.push(Math.round(performance.now() - t));
  }
  return NextResponse.json({ functionRegion: process.env.VERCEL_REGION ?? "local", dbRegion, dbRoundTripMs: times }, { headers: { "cache-control": "no-store" } });
}
