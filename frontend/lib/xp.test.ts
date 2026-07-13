import { describe, it, expect } from "vitest";
import { xpForDay, levelThreshold, levelForXp, xpProgress, computeXpGrant } from "./xp";

describe("xpForDay", () => {
  it("is 10 on day 1 and escalates +5 per streak-day", () => {
    expect(xpForDay(1)).toBe(10);
    expect(xpForDay(2)).toBe(15);
    expect(xpForDay(7)).toBe(40);
  });
  it("never goes below the base for streak 0/negative", () => {
    expect(xpForDay(0)).toBe(10);
  });
});

describe("levelThreshold / levelForXp", () => {
  it("matches the published thresholds", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(levelThreshold)).toEqual([0, 100, 250, 450, 700, 1000, 1350]);
  });
  it("maps xp to the highest reached level", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(249)).toBe(2);
    expect(levelForXp(250)).toBe(3);
    expect(levelForXp(1350)).toBe(7);
  });
});

describe("xpProgress", () => {
  it("reports progress within the current level", () => {
    expect(xpProgress(175)).toEqual({ level: 2, xpIntoLevel: 75, xpForNextLevel: 150 }); // L2 base 100, L3 250
  });
});

describe("computeXpGrant", () => {
  it("awards the escalating XP for a fresh consecutive run", () => {
    const { awardedXp, newCursor } = computeXpGrant([0, 1, 2], 7, null);
    expect(awardedXp).toBe(10 + 15 + 20); // 45
    expect(newCursor).toEqual({ round: 7, day: 2 });
  });
  it("resets the escalation after a gap", () => {
    const { awardedXp } = computeXpGrant([0, 1, 3], 7, null); // gap at day 2
    expect(awardedXp).toBe(10 + 15 + 10); // day 3 restarts at 10
  });
  it("only awards days after the cursor within the same round", () => {
    const { awardedXp, newCursor } = computeXpGrant([0, 1, 2], 7, { round: 7, day: 1 });
    expect(awardedXp).toBe(20); // only day 2, streak run 0-1-2 = 3 -> 20
    expect(newCursor).toEqual({ round: 7, day: 2 });
  });
  it("is idempotent when nothing is new", () => {
    expect(computeXpGrant([0, 1, 2], 7, { round: 7, day: 2 })).toEqual({
      awardedXp: 0,
      newCursor: { round: 7, day: 2 },
    });
  });
  it("resets the cursor and awards from day 0 in a new round", () => {
    const { awardedXp, newCursor } = computeXpGrant([0], 8, { round: 7, day: 2 });
    expect(awardedXp).toBe(10);
    expect(newCursor).toEqual({ round: 8, day: 0 });
  });
});
