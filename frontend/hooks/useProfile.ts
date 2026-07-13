"use client";

import { useQuery } from "@tanstack/react-query";

export interface ProfileView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

export function useProfile(address?: string): { profile: ProfileView | null } {
  const { data } = useQuery({
    queryKey: ["profile", address],
    enabled: !!address,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ProfileView | null> => {
      const res = await fetch(`/api/profile?address=${address}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as { profile: ProfileView | null };
      return json.profile;
    },
  });
  return { profile: data ?? null };
}
