import { describe, it, expect } from "vitest";
import { effectiveRoundStart, roundDayIndex, DAY } from "./roundDay";

const midnight = (y: number, m: number, d: number) =>
  Math.floor(Date.UTC(y, m, d, 0, 0, 0) / 1000);

describe("effectiveRoundStart", () => {
  it("passes a midnight start through unchanged", () => {
    const s = midnight(2026, 6, 4);
    expect(effectiveRoundStart(s)).toBe(s);
  });

  it("snaps a start a few minutes after midnight to that midnight", () => {
    const s = midnight(2026, 6, 4) + 3 * 60; // 00:03
    expect(effectiveRoundStart(s)).toBe(midnight(2026, 6, 4));
  });

  it("snaps a start a few minutes before midnight up to the next midnight", () => {
    const s = midnight(2026, 6, 4) - 2 * 60; // 23:58 the previous day
    expect(effectiveRoundStart(s)).toBe(midnight(2026, 6, 4));
  });

  it("snaps a start within the 6h window (e.g. drifted to 01:30)", () => {
    const s = midnight(2026, 6, 4) + 90 * 60; // 01:30
    expect(effectiveRoundStart(s)).toBe(midnight(2026, 6, 4));
  });

  it("does NOT snap a far-from-midnight (mid-day) start", () => {
    const s = midnight(2026, 6, 1) + 12 * 3600 + 30 * 60; // 12:30 (like round 9)
    expect(effectiveRoundStart(s)).toBe(s);
  });
});

describe("roundDayIndex", () => {
  it("rolls the day index at UTC midnight for a snapped start", () => {
    const start = midnight(2026, 6, 4) + 3 * 60; // 00:03 -> snaps to 00:00
    // Same calendar day, later -> day 0
    expect(roundDayIndex(start, midnight(2026, 6, 4) + 20 * 3600)).toBe(0);
    // Next calendar day -> day 1
    expect(roundDayIndex(start, midnight(2026, 6, 5) + 60)).toBe(1);
    // Just before next midnight is still day 0
    expect(roundDayIndex(start, midnight(2026, 6, 5) - 60)).toBe(0);
  });

  it("uses actual start for a mid-day round (no snap)", () => {
    const start = midnight(2026, 6, 1) + 12 * 3600 + 30 * 60; // 12:30
    expect(roundDayIndex(start, start + 60)).toBe(0);
    expect(roundDayIndex(start, start + DAY + 60)).toBe(1);
  });
});
