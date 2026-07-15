"use client";

import { useReadContract } from "wagmi";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";
import { xpProgress } from "@/lib/xp";

export function useXp(address?: string) {
  const { data: xpRaw, refetch } = useReadContract({
    address: XP_ADDRESS,
    abi: XP_ABI,
    functionName: "xp",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });
  const { data: canClaim } = useReadContract({
    address: XP_ADDRESS,
    abi: XP_ABI,
    functionName: "canClaim",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });

  const xp = xpRaw ? Number(xpRaw as bigint) : 0;
  return { xp, canClaim: canClaim === true, refetch, ...xpProgress(xp) };
}
