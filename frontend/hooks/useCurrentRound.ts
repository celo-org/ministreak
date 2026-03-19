"use client";

import { useReadContract } from "wagmi";
import { VAULT_ABI, VAULT_ADDRESS } from "@/lib/contracts";
import { formatUnits } from "viem";

export interface RoundData {
  roundId: bigint;
  startTime: bigint;
  endTime: bigint;
  pot: bigint;
  potFormatted: string;
  status: number;
  playerCount: bigint;
  daysRemaining: number;
  hoursRemaining: number;
  isOpen: boolean;
}

export function useCurrentRound() {
  const { data: roundId, isLoading: loadingId, isError: errorId } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "getCurrentRoundId",
    query: {
      // Don't retry forever when node is down — fail fast after 2 attempts
      retry: 2,
    },
  });

  const { data: roundData, isLoading: loadingRound, isError: errorRound, refetch } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "rounds",
    args: roundId ? [roundId] : undefined,
    query: { enabled: !!roundId, retry: 2 },
  });

  const now = Math.floor(Date.now() / 1000);

  let data: RoundData | undefined;
  if (roundId && roundData) {
    const [startTime, endTime, pot, status, playerCount] = roundData as unknown as [
      bigint, bigint, bigint, number, bigint
    ];

    const secondsLeft = Math.max(0, Number(endTime) - now);
    const daysRemaining = Math.floor(secondsLeft / 86400);
    const hoursRemaining = Math.floor((secondsLeft % 86400) / 3600);

    data = {
      roundId,
      startTime,
      endTime,
      pot,
      potFormatted: parseFloat(formatUnits(pot, 6)).toFixed(2),
      status,
      playerCount,
      daysRemaining,
      hoursRemaining,
      isOpen: status === 0 && now < Number(endTime),
    };
  }

  return {
    data,
    isLoading: loadingId || loadingRound,
    isError: errorId || errorRound,
    refetch,
  };
}
