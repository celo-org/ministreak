import { NextResponse } from "next/server";
import { isOnboarded, markOnboarded } from "@/lib/onboardStore";
import { readProfile } from "@/lib/oracle/profileStore";

// Per-wallet onboarding gate. Never cached.
export const dynamic = "force-dynamic";
// Bypass Vercel's Data Cache for the @vercel/kv read (see /api/provisional).
export const fetchCache = "force-no-store";

// GET ?address= → { onboarded }. A wallet is "onboarded" if it has explicitly
// finished the intro OR already has an XP profile (a player from before this
// gate existed, or one who has already played — never re-show them the intro).
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ onboarded: false }, { status: 400 });
  }
  const onboarded =
    (await isOnboarded(address)) || (await readProfile(address)) != null;
  return NextResponse.json(
    { onboarded },
    { headers: { "cache-control": "no-store" } }
  );
}

// POST { address } → mark the wallet onboarded (called when the intro is finished).
export async function POST(req: Request) {
  const { address } = await req
    .json()
    .catch(() => ({ address: null as string | null }));
  if (!address) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    await markOnboarded(address);
  } catch (e) {
    // Non-fatal: worst case the intro shows once more on another device.
    console.warn(`markOnboarded failed for ${address}:`, (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
