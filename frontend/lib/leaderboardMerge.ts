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

/** Sort by the contract's order (streak → Score → uniqueTo) and (re)assign rank + prize. */
function rankAndPrize(
  entries: LeaderboardEntry[],
  distributable: number
): LeaderboardEntry[] {
  const sorted = [...entries].sort(
    (a, b) =>
      b.streak - a.streak ||
      b.txCount - a.txCount ||
      b.uniqueToCount - a.uniqueToCount
  );
  return sorted.map((entry, i) => ({
    ...entry,
    rank: i + 1,
    estimatedPrize: prizeFor(i + 1, distributable),
  }));
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

  return rankAndPrize(merged, distributable);
}

/**
 * Client-side optimistic bump for the CONNECTED player's own row: reflect
 * today's tx (detected via Blockscout ~1 min) as a streak increment before the
 * end-of-day on-chain submission, then re-rank/re-prize. Never lowers a streak,
 * and only touches the one matching row (other players rely on the provisional
 * snapshot). Display-only.
 */
export function applySelfStreak(
  entries: LeaderboardEntry[],
  address: string | undefined,
  streak: number,
  distributable: number
): LeaderboardEntry[] {
  if (!address || streak <= 0) return entries;
  const lower = address.toLowerCase();
  let changed = false;
  const bumped = entries.map((entry) => {
    if (entry.address.toLowerCase() !== lower || streak <= entry.streak) return entry;
    changed = true;
    return { ...entry, streak };
  });
  return changed ? rankAndPrize(bumped, distributable) : entries;
}
