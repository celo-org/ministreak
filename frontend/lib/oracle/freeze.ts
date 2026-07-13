/**
 * freeze.ts — streak-freeze (Phase 2b). Cover-on-return: bridge a single missed
 * day when a player returns, by submitting a covered on-chain entry (txCount 0).
 * decideFreezeCover is pure; getLastValidDays / applyFreezeCovers do I/O.
 */
import { type Address, type PublicClient, parseAbi } from "viem";

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
      map.set(players[i].toLowerCase(), Number((r.result as unknown[])[3]));
    }
  });
  return map;
}
