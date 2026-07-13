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
    const p: Profile = { xp: 45, cursor: { round: 7, day: 2 } };
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
    expect(await readProfile(A)).toEqual({ xp: 45, cursor: { round: 7, day: 2 } }); // 10+15+20
  });
  it("is idempotent — re-running awards nothing more", async () => {
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    expect(await readProfile(A)).toEqual({ xp: 25, cursor: { round: 7, day: 1 } });
  });
  it("accumulates across successive runs", async () => {
    await awardXp([entry(A, 0)], 7);
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    expect((await readProfile(A))!.xp).toBe(25); // 10 then +15
  });
});
