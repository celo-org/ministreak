"use client";

import { useReadContract } from "wagmi";
import { parseAbi } from "viem";
import { VAULT_ADDRESS } from "@/lib/contracts";

const ROUND_PLAYERS_ABI = parseAbi([
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
]);

/**
 * The connected player's loyalty multiplier for the current round — the same
 * logic the oracle applies (loyalty.ts): entered the last two rounds → 2.0,
 * only the last → 1.5, otherwise 1.0. Reads the two prior rosters on-chain.
 */
export function useLoyaltyMultiplier(address?: string, roundId?: bigint): number {
  const prevId = roundId && roundId > BigInt(1) ? roundId - BigInt(1) : undefined;
  const prev2Id = roundId && roundId > BigInt(2) ? roundId - BigInt(2) : undefined;

  const { data: prevPlayers } = useReadContract({
    address: VAULT_ADDRESS,
    abi: ROUND_PLAYERS_ABI,
    functionName: "getRoundPlayers",
    args: prevId ? [prevId] : undefined,
    query: { enabled: !!prevId },
  });
  const { data: prev2Players } = useReadContract({
    address: VAULT_ADDRESS,
    abi: ROUND_PLAYERS_ABI,
    functionName: "getRoundPlayers",
    args: prev2Id ? [prev2Id] : undefined,
    query: { enabled: !!prev2Id },
  });

  if (!address) return 1;
  const a = address.toLowerCase();
  const inPrev = ((prevPlayers as readonly string[]) ?? []).some((p) => p.toLowerCase() === a);
  const inPrev2 = ((prev2Players as readonly string[]) ?? []).some((p) => p.toLowerCase() === a);

  if (inPrev && inPrev2) return 2;
  if (inPrev) return 1.5;
  return 1;
}
