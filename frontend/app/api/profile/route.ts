import { NextResponse } from "next/server";
import { readProfile } from "@/lib/oracle/profileStore";
import { xpProgress } from "@/lib/xp";

// Public, read-only per-player XP/level profile. Never cached.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ profile: null }, { status: 400 });
  }
  const stored = await readProfile(address);
  const profile = stored ? { xp: stored.xp, ...xpProgress(stored.xp) } : null;
  return NextResponse.json(
    { profile },
    { headers: { "cache-control": "no-store" } }
  );
}
