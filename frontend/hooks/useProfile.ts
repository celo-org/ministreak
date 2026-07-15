"use client";

import { useQuery } from "@tanstack/react-query";
import { useXp } from "./useXp";

export interface ProfileView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  freezeTokens: number;
}

export function useProfile(address?: string): { profile: ProfileView | null } {
  const { xp, level, xpIntoLevel, xpForNextLevel } = useXp(address);
  const { data: freeze } = useQuery({
    queryKey: ["freeze", address],
    enabled: !!address,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const res = await fetch(`/api/profile?address=${address}`, { cache: "no-store" });
      if (!res.ok) return 0;
      const json = (await res.json()) as { profile: { freezeTokens: number } | null };
      return json.profile?.freezeTokens ?? 0;
    },
  });

  if (!address) return { profile: null };
  return {
    profile: { xp, level, xpIntoLevel, xpForNextLevel, freezeTokens: freeze ?? 0 },
  };
}
