/**
 * profileStore.ts — Vercel KV persistence for per-player XP/level profiles, plus
 * awardXp (idempotent XP grant for closed active days). Reads never throw; the
 * caller treats writes as non-fatal.
 */
import { kv } from "@vercel/kv";
import { computeXpGrant } from "@/lib/xp";
import type { QualifyingTx } from "./scanner";

export interface Profile {
  xp: number;
  cursor: { round: number; day: number } | null;
}

const KEY = (address: string) => `profile:${address.toLowerCase()}`;

export async function readProfile(address: string): Promise<Profile | null> {
  try {
    const p = await kv.get<Profile>(KEY(address));
    return p ?? null;
  } catch (e) {
    console.warn(`readProfile failed for ${address}:`, (e as Error).message);
    return null;
  }
}

export async function writeProfile(address: string, profile: Profile): Promise<void> {
  await kv.set(KEY(address), profile);
}

/**
 * Award XP for closed active days across every player in the batch. Idempotent
 * per player via the stored cursor, so it is safe to call on every scan.
 */
export async function awardXp(closedEntries: QualifyingTx[], round: number): Promise<void> {
  const byPlayer = new Map<string, number[]>();
  for (const e of closedEntries) {
    const key = e.player.toLowerCase();
    const list = byPlayer.get(key);
    if (list) list.push(e.dayIndex);
    else byPlayer.set(key, [e.dayIndex]);
  }

  for (const [address, days] of byPlayer) {
    const profile = (await readProfile(address)) ?? { xp: 0, cursor: null };
    const { awardedXp, newCursor } = computeXpGrant(days, round, profile.cursor);
    if (awardedXp > 0) {
      await writeProfile(address, { xp: profile.xp + awardedXp, cursor: newCursor });
    }
  }
}
