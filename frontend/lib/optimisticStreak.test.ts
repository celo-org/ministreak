import { describe, it, expect } from "vitest";
import { optimisticStreak } from "./optimisticStreak";

const base = {
  onChainStreak: 5,
  lastValidDay: 2 as number | undefined,
  currentDayIndex: 3,
  hasActivityToday: false,
  todayDone: false,
};

describe("optimisticStreak", () => {
  it("returns the on-chain streak when there's no pending activity today", () => {
    expect(optimisticStreak(base)).toBe(5);
  });

  it("returns the on-chain streak when today is already counted on-chain", () => {
    expect(optimisticStreak({ ...base, hasActivityToday: true, todayDone: true })).toBe(5);
  });

  it("bumps +1 when today's tx continues yesterday's streak", () => {
    // lastValidDay 2 === currentDayIndex 3 - 1
    expect(optimisticStreak({ ...base, hasActivityToday: true })).toBe(6);
  });

  it("shows 1 on the first active day of the round (255 sentinel)", () => {
    expect(
      optimisticStreak({
        onChainStreak: 0,
        lastValidDay: 255,
        currentDayIndex: 0,
        hasActivityToday: true,
        todayDone: false,
      })
    ).toBe(1);
  });

  it("shows 1 when returning after a gap (last valid day older than yesterday)", () => {
    expect(
      optimisticStreak({
        onChainStreak: 4,
        lastValidDay: 0,
        currentDayIndex: 3,
        hasActivityToday: true,
        todayDone: false,
      })
    ).toBe(1);
  });
});
