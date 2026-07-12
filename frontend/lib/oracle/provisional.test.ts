import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeProvisional } from "./provisional";
import type { QualifyingTx, RoundInfo } from "./scanner";

const A = "0xAAAA000000000000000000000000000000000000" as const;
const B = "0xBBBB000000000000000000000000000000000000" as const;
const roundInfo = { roundId: 7n } as RoundInfo;

const entry = (player: string, dayIndex: number, txCount = 1, uniqueToCount = 1): QualifyingTx =>
  ({ player: player as `0x${string}`, roundId: 7n, dayIndex, txCount, uniqueToCount });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 8, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("computeProvisional", () => {
  it("sets today's score/uniqueTo and active from the open-day entry", () => {
    const snap = computeProvisional([entry(A, 0), entry(A, 1, 3, 2)], 1, roundInfo);
    expect(snap.players[A.toLowerCase()]).toMatchObject({
      todayScore: 3,
      todayUniqueTo: 2,
      active: true,
    });
  });

  it("computes streak as the consecutive run ending at the most recent active day", () => {
    // active days 0,1,2 (open day = 2) -> streak 3
    const snap = computeProvisional([entry(A, 0), entry(A, 1), entry(A, 2)], 2, roundInfo);
    expect(snap.players[A.toLowerCase()].streak).toBe(3);
  });

  it("resets streak after a gap", () => {
    // active days 0,1,3 (missed day 2), open day = 3 -> streak 1
    const snap = computeProvisional([entry(A, 0), entry(A, 1), entry(A, 3)], 3, roundInfo);
    expect(snap.players[A.toLowerCase()].streak).toBe(1);
  });

  it("marks a player inactive today when they have no open-day entry", () => {
    // active only on closed day 0; open day = 1
    const snap = computeProvisional([entry(A, 0)], 1, roundInfo);
    expect(snap.players[A.toLowerCase()]).toMatchObject({
      active: false,
      todayScore: 0,
      todayUniqueTo: 0,
      streak: 1, // run ends at day 0
    });
  });

  it("carries roundId, dayIndex and updatedAt on the snapshot", () => {
    const snap = computeProvisional([entry(A, 0)], 0, roundInfo);
    expect(snap.roundId).toBe("7");
    expect(snap.dayIndex).toBe(0);
    expect(snap.updatedAt).toBe(Math.floor(Date.UTC(2026, 0, 8, 12, 0, 0) / 1000));
  });

  it("keys players by lowercased address and includes every player with an entry", () => {
    const snap = computeProvisional([entry(A, 0), entry(B, 0)], 0, roundInfo);
    expect(Object.keys(snap.players).sort()).toEqual([A.toLowerCase(), B.toLowerCase()].sort());
  });
});
