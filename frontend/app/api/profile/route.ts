import { NextResponse } from "next/server";
import { readProfile } from "@/lib/oracle/profileStore";

// Public, read-only per-player freeze-token profile. XP now lives on-chain
// (see hooks/useXp.ts). Never cached.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ profile: null }, { status: 400 });
  }
  const stored = await readProfile(address);
  const profile = stored ? { freezeTokens: stored.freezeTokens } : null;
  return NextResponse.json(
    { profile },
    { headers: { "cache-control": "no-store" } }
  );
}
