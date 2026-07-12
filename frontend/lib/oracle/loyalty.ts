/**
 * loyalty.ts
 * Off-chain loyalty multiplier: players who entered prior rounds get a higher
 * per-day Score. Prior rosters are read on-chain via getRoundPlayers — two
 * reads total (rounds N-1 and N-2), independent of player count.
 */
import { type Address, type PublicClient, parseAbi } from "viem";
import type { QualifyingTx } from "./scanner";
import { LOYALTY } from "./scoreConfig";

const LOYALTY_ABI = parseAbi([
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
]);

export interface PriorParticipation {
  prev: Set<string>;
  prev2: Set<string>;
}

export async function getPriorParticipants(
  client: PublicClient,
  vaultAddress: Address,
  roundId: bigint
): Promise<PriorParticipation> {
  const readPlayers = async (rid: bigint): Promise<Set<string>> => {
    if (rid < 1n) return new Set();
    try {
      const players = (await client.readContract({
        address: vaultAddress,
        abi: LOYALTY_ABI,
        functionName: "getRoundPlayers",
        args: [rid],
      })) as Address[];
      return new Set(players.map((p) => p.toLowerCase()));
    } catch {
      return new Set();
    }
  };

  const [prev, prev2] = await Promise.all([
    readPlayers(roundId - 1n),
    readPlayers(roundId - 2n),
  ]);
  return { prev, prev2 };
}

export function loyaltyMultiplierFor(
  player: Address,
  parts: PriorParticipation
): number {
  const p = player.toLowerCase();
  if (parts.prev.has(p) && parts.prev2.has(p)) return LOYALTY.ENTERED_TWO_PLUS;
  if (parts.prev.has(p)) return LOYALTY.ENTERED_LAST;
  return LOYALTY.NONE;
}

export function applyLoyalty(
  qualifying: QualifyingTx[],
  multiplierFor: (player: Address) => number
): QualifyingTx[] {
  return qualifying.map((q) => {
    const mult = multiplierFor(q.player);
    return mult === 1 ? q : { ...q, txCount: Math.round(q.txCount * mult) };
  });
}
