/**
 * optimisticStreak.ts — pure client-side "live" streak for the connected player.
 *
 * The on-chain streak only advances at the end-of-day submission, so the moment
 * today's tx is detected (via useTodayActivity, ~1 min) we reflect it
 * optimistically, matching the "Today's in" pill. Shared by the Home streak card
 * and the connected player's leaderboard row so both feel live.
 */
export function optimisticStreak(args: {
  onChainStreak: number;
  lastValidDay: number | undefined; // 0-6, 255 sentinel, or undefined (no stats)
  currentDayIndex: number;
  hasActivityToday: boolean;
  todayDone: boolean; // today already counted on-chain
}): number {
  const { onChainStreak, lastValidDay, currentDayIndex, hasActivityToday, todayDone } = args;
  const activeTodayPending = hasActivityToday && !todayDone;
  if (!activeTodayPending) return onChainStreak;
  // Today continues yesterday's streak → +1; otherwise (first active day of the
  // round, or returning after a gap) today makes it 1.
  return lastValidDay === currentDayIndex - 1 ? onChainStreak + 1 : 1;
}
