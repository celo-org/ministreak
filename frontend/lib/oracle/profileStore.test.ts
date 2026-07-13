import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, unknown>();
vi.mock("@vercel/kv", () => ({
  kv: {
    set: vi.fn(async (k: string, v: unknown) => {
      store.set(k, v);
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
  },
}));

import { readProfile, writeProfile, awardXp, type Profile } from "./profileStore";
import type { QualifyingTx } from "./scanner";
import { kv } from "@vercel/kv";

const A = "0xAAAA000000000000000000000000000000000000";
const entry = (player: string, dayIndex: number): QualifyingTx =>
  ({ player: player as `0x${string}`, roundId: 7n, dayIndex, txCount: 1, uniqueToCount: 1 });

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("readProfile / writeProfile", () => {
  it("round-trips a profile under profile:<lowercased address>", async () => {
    const p: Profile = { xp: 45, cursor: { round: 7, day: 2 }, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null };
    await writeProfile(A.toUpperCase(), p);
    expect(kv.set).toHaveBeenCalledWith(`profile:${A.toLowerCase()}`, p);
    expect(await readProfile(A)).toEqual(p);
  });
  it("returns null on a miss and never throws on error", async () => {
    expect(await readProfile("0xnope")).toBeNull();
    (kv.get as any).mockRejectedValueOnce(new Error("kv down"));
    expect(await readProfile(A)).toBeNull();
  });
});

describe("awardXp", () => {
  it("awards escalating XP for a player's closed days and advances the cursor", async () => {
    await awardXp([entry(A, 0), entry(A, 1), entry(A, 2)], 7);
    expect(await readProfile(A)).toEqual({ xp: 45, cursor: { round: 7, day: 2 }, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null }); // 10+15+20
  });
  it("is idempotent — re-running awards nothing more", async () => {
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    expect(await readProfile(A)).toEqual({ xp: 25, cursor: { round: 7, day: 1 }, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null });
  });
  it("accumulates across successive runs", async () => {
    await awardXp([entry(A, 0)], 7);
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    expect((await readProfile(A))!.xp).toBe(25); // 10 then +15
  });
  it("skips a player (does not clobber accumulated XP) when the KV read errors transiently", async () => {
    // Seed an existing profile with real accumulated cross-round XP.
    const seeded: Profile = { xp: 900, cursor: { round: 6, day: 6 }, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null };
    await writeProfile(A, seeded);
    vi.clearAllMocks(); // clear the call log from the seed write, keep the store

    // The next kv.get (the awardXp read for this player) blips.
    (kv.get as any).mockRejectedValueOnce(new Error("kv blip"));

    await awardXp([entry(A, 0), entry(A, 1)], 8);

    // Must not have written anything for this player during this run.
    expect(kv.set).not.toHaveBeenCalled();
    // The stored profile must be untouched.
    expect(await readProfile(A)).toEqual(seeded);
  });
});

describe("awardXp — freeze grants + profile shape", () => {
  it("normalizes an old profile (missing freeze fields) on read", async () => {
    await (await import("@vercel/kv")).kv.set(`profile:${A.toLowerCase()}`, { xp: 50, cursor: null });
    expect(await readProfile(A)).toEqual({
      xp: 50, cursor: null, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null,
    });
  });
  it("grants a freeze token when awarded XP pushes the player to level 3", async () => {
    // Seed near L3 (threshold 250). 249 xp + a day that crosses it.
    await writeProfile(A, { xp: 249, cursor: { round: 7, day: 0 }, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null });
    await awardXp([entry(A, 1)], 7); // day-1 streak run [0? not present] -> streak 1 -> +10 xp = 259 -> level 3
    const p = (await readProfile(A))!;
    expect(p.xp).toBe(259);
    expect(p.freezeTokens).toBe(1);
    expect(p.lastFreezeMilestone).toBe(3);
  });
  it("preserves freezeUsedRound across an award", async () => {
    await writeProfile(A, { xp: 0, cursor: null, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: 6 });
    await awardXp([entry(A, 0)], 7);
    expect((await readProfile(A))!.freezeUsedRound).toBe(6);
  });
});
