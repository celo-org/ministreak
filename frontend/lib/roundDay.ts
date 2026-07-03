/**
 * roundDay.ts
 * Shared round-day math for the oracle scanner and the UI, so both agree on
 * which day-index a timestamp falls in.
 *
 * Rounds are meant to run on UTC calendar days, but the contract sets a
 * round's startTime to the previous round's *resolution* timestamp — which can
 * land a few minutes (human/cron delay) off midnight. To keep day windows
 * aligned to calendar days, a start within SNAP_WINDOW of a UTC midnight is
 * snapped to that midnight. Starts far from midnight (legacy mid-day rounds)
 * are used as-is, so this can be deployed without disturbing an in-flight
 * round that started mid-day.
 */

export const DAY = 86400;

/** Snap starts within this distance of a UTC midnight to that midnight. */
export const SNAP_WINDOW = 6 * 3600; // 6 hours

/**
 * The effective (calendar-aligned) start of a round, in unix seconds.
 * Near-midnight starts snap to midnight; far starts pass through unchanged.
 */
export function effectiveRoundStart(startTime: bigint | number): number {
  const s = Number(startTime);
  const nearestMidnight = Math.round(s / DAY) * DAY;
  return Math.abs(s - nearestMidnight) <= SNAP_WINDOW ? nearestMidnight : s;
}

/**
 * Round-day index (0-based) of a unix-second timestamp. May be negative (before
 * the round) or greater than 6 (past the 7-day window); callers clamp as needed.
 */
export function roundDayIndex(
  startTime: bigint | number,
  tsSec: number
): number {
  return Math.floor((tsSec - effectiveRoundStart(startTime)) / DAY);
}
