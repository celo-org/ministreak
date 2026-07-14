"use client";

import { useQuery } from "@tanstack/react-query";
import { effectiveRoundStart, DAY } from "@/lib/roundDay";
import { hasOutgoingToday } from "@/lib/todayActivity";

const BLOCKSCOUT_API = "https://celo.blockscout.com/api/v2";

/**
 * True once the connected player has an outgoing tx in today's round-day window.
 * One Blockscout call for the connected address only — cheap, and refreshed on a
 * short interval so "Today's in" flips within ~a minute of the player's tx.
 */
export function useTodayActivity(
  address?: string,
  round?: { startTime: bigint }
): { hasActivityToday: boolean; isLoading: boolean } {
  const base = round ? effectiveRoundStart(round.startTime) : 0;
  const now = Math.floor(Date.now() / 1000);
  const dayIndex = round ? Math.floor((now - base) / DAY) : -1;
  const todayStart = base + Math.max(dayIndex, 0) * DAY;

  const enabled = !!address && !!round && dayIndex >= 0 && dayIndex <= 6;

  const { data, isLoading } = useQuery({
    queryKey: ["todayActivity", address, todayStart],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const url = `${BLOCKSCOUT_API}/addresses/${address}/transactions?filter=from`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return false;
      const json: {
        items?: Array<{ timestamp: string; to?: { hash: string } | null }>;
      } = await res.json();
      const txs = (json.items ?? []).map((i) => ({
        to: i.to?.hash ?? null,
        timestamp: Math.floor(new Date(i.timestamp).getTime() / 1000),
      }));
      return hasOutgoingToday(txs, todayStart, address as string);
    },
  });

  return { hasActivityToday: data === true, isLoading };
}
