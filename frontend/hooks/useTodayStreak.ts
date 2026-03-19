"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPlayerDailyStreaks } from "@/lib/graphql";

/**
 * Checks whether the connected player has a qualifying streak tx recorded
 * for today's UTC day in the current round.
 */
export function useTodayStreak(
  roundId: string | undefined,
  playerAddress: string | undefined
) {
  // Calculate today's day index (0-6) relative to round start
  // We can't know round start without the contract, so we use subgraph data
  return useQuery({
    queryKey: ["todayStreak", roundId, playerAddress],
    queryFn: async () => {
      if (!roundId || !playerAddress) return null;
      const result = await fetchPlayerDailyStreaks(roundId, playerAddress);
      if (!result.playerRound) return { todayDone: false, dailyStreaks: [] };

      const streaks = result.playerRound.dailyStreaks;
      const today = Math.floor(Date.now() / 1000 / 86400) * 86400; // today's UTC start

      const todayStreak = streaks.find(
        (s) => parseInt(s.timestamp) >= today
      );

      return {
        todayDone: !!todayStreak,
        dailyStreaks: streaks.map((s) => ({
          dayIndex: parseInt(s.dayIndex),
          txCount: parseInt(s.txCount),
          uniqueToCount: parseInt(s.uniqueToCount),
          newStreak: parseInt(s.newStreak),
          timestamp: parseInt(s.timestamp),
        })),
      };
    },
    enabled: !!roundId && !!playerAddress,
    refetchInterval: 60_000, // refresh every minute
  });
}
