/**
 * xp.ts — pure XP/level math for the off-chain retention layer.
 */
export const XP_BASE = 10;
export const XP_STREAK_STEP = 5;

/** XP earned for completing a day, given that day's trailing streak length. */
export function xpForDay(streakThatDay: number): number {
  return XP_BASE + Math.max(0, streakThatDay - 1) * XP_STREAK_STEP;
}

/** Cumulative XP required to reach level n (n >= 1). threshold(1) = 0. */
export function levelThreshold(n: number): number {
  return 50 * ((n * (n + 1)) / 2 - 1);
}

/** Highest level whose threshold is <= xp. */
export function levelForXp(xp: number): number {
  let n = 1;
  while (levelThreshold(n + 1) <= xp) n++;
  return n;
}

export function xpProgress(xp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
} {
  const level = levelForXp(xp);
  const base = levelThreshold(level);
  const next = levelThreshold(level + 1);
  return { level, xpIntoLevel: xp - base, xpForNextLevel: next - base };
}

/**
 * XP to award this run and the advanced cursor. Awards only active closed days
 * newer than the cursor (within the same round; a new round starts fresh).
 * streakThatDay is the consecutive run of active days ending at that day.
 */
export function computeXpGrant(
  activeClosedDays: number[],
  round: number,
  cursor: { round: number; day: number } | null
): { awardedXp: number; newCursor: { round: number; day: number } } {
  const days = [...new Set(activeClosedDays)].sort((a, b) => a - b);
  const daySet = new Set(days);
  const startAfter = cursor && cursor.round === round ? cursor.day : -1;
  const newDays = days.filter((d) => d > startAfter);

  let awardedXp = 0;
  for (const d of newDays) {
    let streak = 0;
    for (let k = d; k >= 0 && daySet.has(k); k--) streak++;
    awardedXp += xpForDay(streak);
  }

  const newCursor = newDays.length
    ? { round, day: newDays[newDays.length - 1] }
    : cursor ?? { round, day: -1 };
  return { awardedXp, newCursor };
}
