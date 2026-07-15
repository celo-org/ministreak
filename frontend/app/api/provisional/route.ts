import { NextRequest, NextResponse } from "next/server";
import { readProvisional } from "@/lib/oracle/provisionalStore";

// Public, read-only provisional leaderboard snapshot. Never cached.
export const dynamic = "force-dynamic";
// Without this, @vercel/kv's internal fetch to Upstash gets stored in Vercel's
// (persistent, cross-deploy) Data Cache and the read freezes on a stale snapshot
// while the store itself is fresh. force-dynamic alone doesn't cover it.
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const roundId = url.searchParams.get("roundId");
  if (!roundId) {
    return NextResponse.json({ snapshot: null }, { status: 400 });
  }
  const snapshot = await readProvisional(roundId);
  return NextResponse.json(
    { snapshot },
    { headers: { "cache-control": "no-store" } }
  );
}
