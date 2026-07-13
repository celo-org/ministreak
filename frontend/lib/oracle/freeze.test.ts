import { describe, it, expect, vi } from "vitest";

vi.mock("./profileStore", () => ({
  readProfile: vi.fn(),
  writeProfile: vi.fn(),
}));

import { applyFreezeCovers, decideFreezeCover, freezeEnabled, getLastValidDays } from "./freeze";
import { readProfile, writeProfile } from "./profileStore";
import type { QualifyingTx, RoundInfo } from "./scanner";

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

const P = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x000000000000000000000000000000000000ba5e" as const;

describe("applyFreezeCovers", () => {
  function clientWithLastValid(day: number) {
    return {
      multicall: vi.fn(async () => [{ status: "success", result: [3, 0, 0, day, false, true] }]),
    } as any;
  }
  const roundInfo = { roundId: 7n, players: [P], vaultAddress: VAULT } as RoundInfo;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("covers a returning player's missed day and consumes a token", async () => {
    // lastValidDay 2, active again on day 4 (in qualifying) -> cover day 3
    (readProfile as any).mockResolvedValue({ xp: 300, cursor: null, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null });
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    const covered = await applyFreezeCovers(clientWithLastValid(2), VAULT, roundInfo, qualifying);
    expect(covered).toEqual([{ player: P, roundId: 7n, dayIndex: 3, txCount: 0, uniqueToCount: 0 }]);
    expect(writeProfile).toHaveBeenCalledWith(P.toLowerCase(), expect.objectContaining({ freezeTokens: 0, freezeUsedRound: 7 }));
  });

  it("returns no cover when the player has no token", async () => {
    (readProfile as any).mockResolvedValue({ xp: 0, cursor: null, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null });
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    expect(await applyFreezeCovers(clientWithLastValid(2), VAULT, roundInfo, qualifying)).toEqual([]);
    expect(writeProfile).not.toHaveBeenCalled();
  });

  it("skips a player whose profile read returns null", async () => {
    (readProfile as any).mockResolvedValue(null);
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    expect(await applyFreezeCovers(clientWithLastValid(2), VAULT, roundInfo, qualifying)).toEqual([]);
  });

  it("skips inactive players without reading their profile", async () => {
    const Q = "0x2222222222222222222222222222222222222222" as const;
    const roundInfoTwo = { roundId: 7n, players: [P, Q], vaultAddress: VAULT } as RoundInfo;
    const client = {
      multicall: vi.fn(async () => [
        { status: "success", result: [3, 0, 0, 2, false, true] }, // P
        { status: "success", result: [0, 0, 0, 255, false, true] }, // Q
      ]),
    } as any;
    (readProfile as any).mockResolvedValue({ xp: 300, cursor: null, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null });
    // Only P has a qualifying entry this scan; Q has none.
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    await applyFreezeCovers(client, VAULT, roundInfoTwo, qualifying);
    expect(readProfile).toHaveBeenCalledWith(P.toLowerCase());
    expect(readProfile).not.toHaveBeenCalledWith(Q.toLowerCase());
  });
});

describe("freezeEnabled", () => {
  it("defaults on, off only when explicitly 'false'", () => {
    delete process.env.FREEZE_ENABLED;
    expect(freezeEnabled()).toBe(true);
    process.env.FREEZE_ENABLED = "false";
    expect(freezeEnabled()).toBe(false);
    delete process.env.FREEZE_ENABLED;
  });
});
