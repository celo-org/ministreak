"use client";

import { useReadContract } from "wagmi";
import { VAULT_ABI, VAULT_ADDRESS } from "@/lib/contracts";
import { type Address } from "viem";

export interface PlayerStats {
  streak: number;
  txCount: number;
  uniqueToCount: number;
  lastValidDay: number;
  claimed: boolean;
  entered: boolean;
}

export function usePlayerStats(roundId: bigint | undefined, player: Address | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getPlayerStats",
    args: roundId && player ? [roundId, player] : undefined,
    query: { enabled: !!roundId && !!player },
  });

  let stats: PlayerStats | undefined;
  if (data) {
    const [streak, txCount, uniqueToCount, lastValidDay, claimed, entered] = data as [
      number, number, number, number, boolean, boolean
    ];
    stats = {
      streak,
      txCount,
      uniqueToCount,
      lastValidDay,
      claimed,
      entered,
    };
  }

  return { stats, isLoading, refetch };
}
