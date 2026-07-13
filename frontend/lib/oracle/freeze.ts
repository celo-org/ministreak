/**
 * freeze.ts — streak-freeze (Phase 2b). Cover-on-return: bridge a single missed
 * day when a player returns, by submitting a covered on-chain entry (txCount 0).
 * decideFreezeCover is pure; getLastValidDays / applyFreezeCovers do I/O.
 */
import { type Address, type PublicClient, parseAbi } from "viem";
import type { QualifyingTx, RoundInfo } from "./scanner";
import { readProfile, writeProfile } from "./profileStore";

const VAULT_ABI = parseAbi([
  "function getPlayerStats(uint256 roundId, address player) external view returns (uint8 streak, uint32 txCount, uint16 uniqueToCount, uint8 lastValidDay, bool claimed, bool entered)",
]);

/**
 * The day index to cover, or null. Covers exactly one missed day (lastValidDay+1)
 * only when the player is active again on lastValidDay+2, holds a token, and
 * hasn't used a freeze this round.
 */
export function decideFreezeCover(args: {
  lastValidDay: number;
  activeClosedDays: number[];
  freezeTokens: number;
  freezeUsedRound: number | null;
  currentRound: number;
}): number | null {
  const { lastValidDay, activeClosedDays, freezeTokens, freezeUsedRound, currentRound } = args;
  if (freezeTokens < 1) return null;
  if (freezeUsedRound === currentRound) return null;
  if (lastValidDay < 0 || lastValidDay > 6) return null; // 255 sentinel / invalid
  const returnDay = activeClosedDays.filter((d) => d > lastValidDay).sort((a, b) => a - b)[0];
  if (returnDay === undefined) return null;
  if (returnDay - lastValidDay !== 2) return null; // exactly one missed day
  return lastValidDay + 1;
}

/** Read each player's on-chain lastValidDay (255 = none) via one multicall. */
export async function getLastValidDays(
  client: PublicClient,
  vaultAddress: Address,
  roundId: bigint,
  players: Address[]
): Promise<Map<string, number>> {
  if (players.length === 0) return new Map();
  const calls = players.map((p) => ({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "getPlayerStats" as const,
    args: [roundId, p] as const,
  }));
  const results = await client.multicall({ contracts: calls });
  const map = new Map<string, number>();
  results.forEach((r, i) => {
    if (r.status === "success") {
      map.set(players[i].toLowerCase(), Number(((r.result as any) as unknown[])[3]));
    }
  });
  return map;
}

/** Streak-freeze on-chain apply is enabled unless FREEZE_ENABLED === "false". */
export function freezeEnabled(): boolean {
  return process.env.FREEZE_ENABLED !== "false";
}

/**
 * For each returning player with a coverable single-day gap, produce a covered
 * entry (txCount 0) to bridge the streak and consume one freeze token. Players
 * with no qualifying activity this scan are skipped before the KV read (they
 * can't be a returning player). A profile read/write failure for one player is
 * caught and skipped so it can't abort the batch (never fabricates a cover).
 */
export async function applyFreezeCovers(
  client: PublicClient,
  vaultAddress: Address,
  roundInfo: RoundInfo,
  qualifying: QualifyingTx[]
): Promise<QualifyingTx[]> {
  const round = Number(roundInfo.roundId);
  const lastValid = await getLastValidDays(client, vaultAddress, roundInfo.roundId, roundInfo.players);

  const daysByPlayer = new Map<string, number[]>();
  for (const q of qualifying) {
    const key = q.player.toLowerCase();
    const list = daysByPlayer.get(key);
    if (list) list.push(q.dayIndex);
    else daysByPlayer.set(key, [q.dayIndex]);
  }

  const covered: QualifyingTx[] = [];
  for (const player of roundInfo.players) {
    const key = player.toLowerCase();
    const activeClosedDays = daysByPlayer.get(key);
    if (!activeClosedDays) continue; // no activity this scan -> can't be a returning player; skip the KV read
    try {
      const profile = await readProfile(key);
      if (!profile) continue; // read error or true miss -> never fabricate a cover
      const coverDay = decideFreezeCover({
        lastValidDay: lastValid.get(key) ?? 255,
        activeClosedDays,
        freezeTokens: profile.freezeTokens,
        freezeUsedRound: profile.freezeUsedRound,
        currentRound: round,
      });
      if (coverDay === null) continue;
      covered.push({ player, roundId: roundInfo.roundId, dayIndex: coverDay, txCount: 0, uniqueToCount: 0 });
      await writeProfile(key, { ...profile, freezeTokens: profile.freezeTokens - 1, freezeUsedRound: round });
    } catch (e) {
      console.warn(`applyFreezeCovers: ${key} failed, skipping: ${(e as Error).message}`);
      continue;
    }
  }
  return covered;
}
