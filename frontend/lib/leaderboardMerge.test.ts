import { describe, it, expect } from "vitest";
import { mergeProvisional, applySelfStreak } from "./leaderboardMerge";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { ProvisionalSnapshot } from "@/lib/oracle/provisional";

const A = "0xAAAA000000000000000000000000000000000000";
const B = "0xBBBB000000000000000000000000000000000000";

const e = (over: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  rank: 0, address: A, streak: 0, txCount: 0, uniqueToCount: 0, estimatedPrize: "0.00", ...over,
});

const snap = (players: ProvisionalSnapshot["players"]): ProvisionalSnapshot =>
  ({ roundId: "7", dayIndex: 1, updatedAt: 5, players });

describe("mergeProvisional", () => {
  it("returns entries unchanged when snapshot is null", () => {
    const entries = [e({ address: A, streak: 2 })];
    expect(mergeProvisional(entries, null, 100)).toBe(entries);
  });

  it("adds today's score/uniqueTo and uses provisional streak", () => {
    const entries = [e({ address: A, streak: 1, txCount: 4, uniqueToCount: 2 })];
    const out = mergeProvisional(
      entries,
      snap({ [A.toLowerCase()]: { streak: 2, todayScore: 3, todayUniqueTo: 1, active: true } }),
      100
    );
    expect(out[0]).toMatchObject({ streak: 2, txCount: 7, uniqueToCount: 3 });
  });

  it("re-ranks after merge so an active player can climb", () => {
    // B leads on-chain; A is active today and overtakes on streak.
    const entries = [
      e({ address: B, streak: 1, txCount: 9 }),
      e({ address: A, streak: 1, txCount: 1 }),
    ];
    const out = mergeProvisional(
      entries,
      snap({ [A.toLowerCase()]: { streak: 2, todayScore: 1, todayUniqueTo: 0, active: true } }),
      100
    );
    expect(out.map((x) => x.address)).toEqual([A, B]);
    expect(out[0].rank).toBe(1);
    expect(out[0].estimatedPrize).toBe("50.00"); // distributable 100 * 0.5
  });

  it("leaves players absent from the snapshot on their on-chain values", () => {
    const entries = [e({ address: A, streak: 3, txCount: 5 })];
    const out = mergeProvisional(entries, snap({}), 100);
    expect(out[0]).toMatchObject({ streak: 3, txCount: 5, rank: 1 });
  });
});

describe("applySelfStreak", () => {
  it("bumps the connected player's row and re-ranks so they climb", () => {
    const entries = [
      e({ address: B, streak: 1, rank: 1 }),
      e({ address: A, streak: 0, rank: 2 }),
    ];
    const out = applySelfStreak(entries, A, 2, 100);
    expect(out.map((x) => x.address)).toEqual([A, B]);
    expect(out[0]).toMatchObject({ address: A, streak: 2, rank: 1, estimatedPrize: "50.00" });
  });

  it("never lowers a streak (no-op when the bump isn't higher)", () => {
    const entries = [e({ address: A, streak: 4 })];
    expect(applySelfStreak(entries, A, 3, 100)).toBe(entries); // unchanged reference
  });

  it("is a no-op without an address or with a zero streak", () => {
    const entries = [e({ address: A, streak: 0 })];
    expect(applySelfStreak(entries, undefined, 2, 100)).toBe(entries);
    expect(applySelfStreak(entries, A, 0, 100)).toBe(entries);
  });

  it("ignores an address that isn't in the entries", () => {
    const entries = [e({ address: B, streak: 1 })];
    expect(applySelfStreak(entries, A, 5, 100)).toBe(entries);
  });
});
