import { describe, it, expect, vi } from "vitest";
import { decideFreezeCover, getLastValidDays } from "./freeze";

const base = { freezeTokens: 1, freezeUsedRound: null as number | null, currentRound: 7 };

describe("decideFreezeCover", () => {
  it("covers the single missed day when the player returns after a 1-day gap", () => {
    // last recorded day 2, active again on day 4 -> missed day 3
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [4] })).toBe(3);
  });
  it("returns null with no token", () => {
    expect(decideFreezeCover({ ...base, freezeTokens: 0, lastValidDay: 2, activeClosedDays: [4] })).toBeNull();
  });
  it("returns null if a freeze was already used this round", () => {
    expect(decideFreezeCover({ ...base, freezeUsedRound: 7, lastValidDay: 2, activeClosedDays: [4] })).toBeNull();
  });
  it("returns null when the player has not returned yet", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [] })).toBeNull();
  });
  it("returns null on a consecutive day (no gap)", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [3] })).toBeNull();
  });
  it("returns null on a 2+ day gap (no consecutive cover)", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [5] })).toBeNull();
  });
  it("returns null on the 255 sentinel (no recorded day)", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 255, activeClosedDays: [2] })).toBeNull();
  });
  it("uses the earliest return day", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [6, 4] })).toBe(3);
  });
});

describe("getLastValidDays", () => {
  it("maps each player to their lastValidDay via multicall", async () => {
    const A = "0xAAAA000000000000000000000000000000000000" as const;
    const B = "0xBBBB000000000000000000000000000000000000" as const;
    const client = {
      multicall: vi.fn(async () => [
        { status: "success", result: [3, 5, 2, 4, false, true] }, // A: lastValidDay 4
        { status: "success", result: [0, 0, 0, 255, false, true] }, // B: none
      ]),
    } as any;
    const map = await getLastValidDays(client, "0xvault" as any, 7n, [A, B]);
    expect(map.get(A.toLowerCase())).toBe(4);
    expect(map.get(B.toLowerCase())).toBe(255);
  });
});
