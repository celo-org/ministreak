import { NextRequest, NextResponse } from "next/server";
import { readProvisional } from "@/lib/oracle/provisionalStore";

// Public, read-only provisional leaderboard snapshot. Never cached.
export const dynamic = "force-dynamic";

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
