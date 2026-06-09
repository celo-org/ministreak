"use client";

import { useReadContract } from "wagmi";
import { VAULT_ABI, VAULT_ADDRESS } from "@/lib/contracts";

export interface RefundInfo {
  claimable: boolean;
  roundId: bigint | null;
}

const REFUNDED_STATUS = 3;

export function usePreviousRoundRefund(
  currentRoundId: bigint | undefined,
  address: `0x${string}` | undefined
) {
  const prevRoundId =
    currentRoundId && currentRoundId > BigInt(1)
      ? currentRoundId - BigInt(1)
      : undefined;

  const { data: roundData, isLoading: loadingRound, refetch: refetchRound } =
    useReadContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "rounds",
      args: prevRoundId ? [prevRoundId] : undefined,
      query: { enabled: !!prevRoundId, retry: 1 },
    });

  const status = roundData
    ? Number((roundData as unknown as [bigint, bigint, bigint, number, bigint])[3])
    : undefined;

  const isRefunded = status === REFUNDED_STATUS;

  const { data: playerStats, isLoading: loadingStats, refetch: refetchStats } =
    useReadContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getPlayerStats",
      args: prevRoundId && address ? [prevRoundId, address] : undefined,
      query: {
        enabled: !!prevRoundId && !!address && isRefunded,
        retry: 1,
      },
    });

  let claimable = false;
  if (isRefunded && playerStats) {
    const [, , , , claimed, entered] = playerStats as unknown as [
      number, number, number, number, boolean, boolean
    ];
    claimable = entered && !claimed;
  }

  return {
    info: {
      claimable,
      roundId: prevRoundId ?? null,
    } as RefundInfo,
    isLoading: loadingRound || loadingStats,
    refetch: () => {
      refetchRound();
      refetchStats();
    },
  };
}
