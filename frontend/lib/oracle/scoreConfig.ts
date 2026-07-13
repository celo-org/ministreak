/**
 * scoreConfig.ts
 * Tunable knobs for the off-chain Score engine (anti-farm rate cap + loyalty).
 * Kept in one place so parameters can be adjusted without touching logic.
 */

/** Anti-farm: at most one counted tx per this many seconds (default 30 min). */
export const RATE_WINDOW_SECONDS = 30 * 60;

/** Loyalty multipliers applied to a player's daily Score (txCount). */
export const LOYALTY = {
  NONE: 1.0,
  ENTERED_LAST: 1.5,
  ENTERED_TWO_PLUS: 2.0,
} as const;

/** Max freeze tokens a player can hold (streak-freeze, Phase 2b). */
export const FREEZE_CAP = 2;
