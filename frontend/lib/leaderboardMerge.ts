/**
 * leaderboardMerge.ts
 * Fold the provisional (today) snapshot into the on-chain leaderboard: additive
 * Score/uniqueTo, provisional streak, then re-sort/re-rank/re-prize by the
 * contract's order (streak -> Score -> uniqueTo). Display-only.
 */
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { ProvisionalSnapshot } from "@/lib/oracle/provisional";

function prizeFor(rank: number, distributable: number): string {
  if (rank === 1) return (distributable * 0.5).toFixed(2);
  if (rank === 2) return (distributable * 0.3).toFixed(2);
  if (rank === 3) return (distributable * 0.2).toFixed(2);
  return "0.00";
}

export function mergeProvisional(
  entries: LeaderboardEntry[],
  snapshot: ProvisionalSnapshot | null,
  distributable: number
): LeaderboardEntry[] {
  if (!snapshot) return entries;

  const merged = entries.map((entry) => {
    const p = snapshot.players[entry.address.toLowerCase()];
    if (!p) return entry;
    return {
      ...entry,
      streak: p.streak,
      txCount: entry.txCount + p.todayScore,
      uniqueToCount: entry.uniqueToCount + p.todayUniqueTo,
    };
  });

  merged.sort(
    (a, b) =>
      b.streak - a.streak ||
      b.txCount - a.txCount ||
      b.uniqueToCount - a.uniqueToCount
  );

  return merged.map((entry, i) => ({
    ...entry,
    rank: i + 1,
    estimatedPrize: prizeFor(i + 1, distributable),
  }));
}
