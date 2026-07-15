/**
 * profileStore.ts — Vercel KV persistence for per-player streak-freeze profiles.
 * XP now lives on-chain (StreakXP); this store only tracks freeze-token state.
 * Reads never throw; the caller treats writes as non-fatal.
 */
import { kv } from "@vercel/kv";
import { grantFreezes } from "@/lib/xp";
import { FREEZE_CAP } from "./scoreConfig";

export interface Profile {
  freezeTokens: number;
  lastFreezeMilestone: number;
  freezeUsedRound: number | null;
}

function normalize(p: Partial<Profile>): Profile {
  return {
    freezeTokens: p.freezeTokens ?? 0,
    lastFreezeMilestone: p.lastFreezeMilestone ?? 0,
    freezeUsedRound: p.freezeUsedRound ?? null,
  };
}

const KEY = (address: string) => `profile:${address.toLowerCase()}`;

export async function readProfile(address: string): Promise<Profile | null> {
  try {
    const p = await kv.get<Profile>(KEY(address));
    return p ? normalize(p) : null;
  } catch (e) {
    console.warn(`readProfile failed for ${address}:`, (e as Error).message);
    return null;
  }
}

export async function writeProfile(address: string, profile: Profile): Promise<void> {
  await kv.set(KEY(address), profile);
}

/** Grant freeze tokens for a player based on their (on-chain) XP level. Idempotent
 *  via lastFreezeMilestone; non-fatal reads. */
export async function grantFreezesFor(address: string, level: number): Promise<void> {
  let stored: Profile | null;
  try {
    stored = await readProfile(address);
  } catch {
    return;
  }
  const p = stored ?? { freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null };
  const { freezeTokens, lastFreezeMilestone } = grantFreezes(
    p.freezeTokens, p.lastFreezeMilestone, level, FREEZE_CAP
  );
  if (freezeTokens !== p.freezeTokens || lastFreezeMilestone !== p.lastFreezeMilestone) {
    await writeProfile(address, { ...p, freezeTokens, lastFreezeMilestone });
  }
}
