"use client";

import { useReadContract } from "wagmi";
import { keccak256, toBytes } from "viem";
import { VAULT_ABI, VAULT_ADDRESS } from "@/lib/contracts";

const KEEPER_ROLE = keccak256(toBytes("KEEPER_ROLE"));
const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

export function useIsAdmin(address: `0x${string}` | undefined) {
  const { data: isKeeper, isLoading: l1 } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "hasRole",
    args: address ? [KEEPER_ROLE, address] : undefined,
    query: { enabled: !!address, retry: 1 },
  });

  const { data: isDefaultAdmin, isLoading: l2 } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: "hasRole",
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    query: { enabled: !!address, retry: 1 },
  });

  return {
    isAdmin: Boolean(isKeeper) || Boolean(isDefaultAdmin),
    isLoading: l1 || l2,
  };
}
