"use client";

import { useReadContract } from "wagmi";
import { VAULT_ADDRESS, VAULT_ABI } from "@/lib/contracts";
import { formatUnits } from "viem";
import { useQuery } from "@tanstack/react-query";
import { mergeProvisional } from "@/lib/leaderboardMerge";
import type { ProvisionalSnapshot } from "@/lib/oracle/provisional";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  streak: number;
  txCount: number;
  uniqueToCount: number;
  estimatedPrize: string;
}

export function useLeaderboard(roundId: string | undefined) {
  const roundIdBigInt = roundId ? BigInt(roundId) : undefined;

  // Read leaderboard directly from contract
  const { data: lbData, isLoading: lbLoading } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getLeaderboard",
    args: roundIdBigInt ? [roundIdBigInt] : undefined,
    query: { enabled: !!roundIdBigInt, retry: 2 },
  });

  // Read round data for pot size
  const { data: roundData, isLoading: roundLoading } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "rounds",
    args: roundIdBigInt ? [roundIdBigInt] : undefined,
    query: { enabled: !!roundIdBigInt, retry: 2 },
  });

  const { data: provisional } = useQuery({
    queryKey: ["provisional", roundId],
    enabled: !!roundId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ProvisionalSnapshot | null> => {
      const res = await fetch(`/api/provisional?roundId=${roundId}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as { snapshot: ProvisionalSnapshot | null };
      return json.snapshot;
    },
  });

  const isLoading = lbLoading || roundLoading;

  let entries: LeaderboardEntry[] = [];

  if (lbData && roundData) {
    const [addresses, streaks, txCounts, uniqueToCounts] = lbData as [
      string[], number[], number[], number[], bigint[]
    ];
    const pot = (roundData as [bigint, bigint, bigint, number, bigint])[2];
    const potUsdt = parseFloat(formatUnits(pot, 6));
    const distributable = potUsdt * 0.95;

    entries = addresses
      .map((addr, i) => ({
        rank: i + 1,
        address: addr,
        streak: Number(streaks[i]),
        txCount: Number(txCounts[i]),
        uniqueToCount: Number(uniqueToCounts[i]),
        estimatedPrize: "0.00",
      }))
      .filter((e) => e.address !== "0x0000000000000000000000000000000000000000")
      .map((entry, i) => {
        const rank = i + 1;
        let prize = "0.00";
        if (rank === 1) prize = (distributable * 0.5).toFixed(2);
        else if (rank === 2) prize = (distributable * 0.3).toFixed(2);
        else if (rank === 3) prize = (distributable * 0.2).toFixed(2);
        return { ...entry, rank, estimatedPrize: prize };
      });

    // Merge today's provisional snapshot (display-only) and re-rank.
    entries = mergeProvisional(entries, provisional ?? null, distributable);
  }

  // Build round info from on-chain data
  let roundInfo = undefined;
  if (roundData) {
    const [, endTime, pot, status, playerCount] = roundData as [bigint, bigint, bigint, number, bigint];
    const statusLabels = ["Open", "Closed", "Resolved", "Refunded"];
    // The contract leaves status = Open (0) after endTime until the round is
    // resolved (Closed(1) is only transient mid-resolution). Surface "Closed"
    // once the round has ended, to match the home page's isOpen logic.
    const ended = Math.floor(Date.now() / 1000) >= Number(endTime);
    const displayStatus =
      status === 0 && ended ? "Closed" : statusLabels[status] || "Unknown";
    roundInfo = {
      pot: parseFloat(formatUnits(pot, 6)).toFixed(2),
      playerCount: Number(playerCount).toString(),
      status: displayStatus,
    };
  }

  return {
    data: roundIdBigInt ? { entries, round: roundInfo } : null,
    isLoading,
    updatedAt: provisional?.updatedAt,
  };
}
