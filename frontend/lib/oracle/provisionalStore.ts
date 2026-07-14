/**
 * provisionalStore.ts
 * Vercel KV read/write for the provisional leaderboard snapshot. Reads never
 * throw (missing/failed -> null) so the UI degrades to the on-chain leaderboard.
 */
import { kv } from "@vercel/kv";
import type { ProvisionalSnapshot } from "./provisional";

const KEY = (roundId: string) => `provisional:${roundId}`;
const TTL_SECONDS = 3 * 3600;

export async function writeProvisional(snapshot: ProvisionalSnapshot): Promise<void> {
  await kv.set(KEY(snapshot.roundId), snapshot, { ex: TTL_SECONDS });
}

export async function readProvisional(
  roundId: string
): Promise<ProvisionalSnapshot | null> {
  try {
    const snap = await kv.get<ProvisionalSnapshot>(KEY(roundId));
    return snap ?? null;
  } catch (e) {
    console.warn(`readProvisional failed for ${roundId}:`, (e as Error).message);
    return null;
  }
}
