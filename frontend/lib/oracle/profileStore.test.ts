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

import { readProfile, writeProfile, grantFreezesFor, type Profile } from "./profileStore";
import { kv } from "@vercel/kv";

const A = "0xAAAA000000000000000000000000000000000000";

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("readProfile / writeProfile", () => {
  it("round-trips a profile under profile:<lowercased address>", async () => {
    const p: Profile = { freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null };
    await writeProfile(A.toUpperCase(), p);
    expect(kv.set).toHaveBeenCalledWith(`profile:${A.toLowerCase()}`, p);
    expect(await readProfile(A)).toEqual(p);
  });
  it("returns null on a miss and never throws on error", async () => {
    expect(await readProfile("0xnope")).toBeNull();
    (kv.get as any).mockRejectedValueOnce(new Error("kv down"));
    expect(await readProfile(A)).toBeNull();
  });
  it("normalizes an old/partial profile (missing freeze fields) on read", async () => {
    await (await import("@vercel/kv")).kv.set(`profile:${A.toLowerCase()}`, {});
    expect(await readProfile(A)).toEqual({
      freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null,
    });
  });
});

describe("grantFreezesFor", () => {
  it("grants a freeze token when the level crosses a milestone (every 3rd level)", async () => {
    await grantFreezesFor(A, 3);
    expect(await readProfile(A)).toEqual({
      freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null,
    });
  });
  it("is idempotent — calling again at the same level grants nothing more", async () => {
    await grantFreezesFor(A, 3);
    await grantFreezesFor(A, 3);
    expect(await readProfile(A)).toEqual({
      freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null,
    });
  });
  it("does not write when the level hasn't crossed a new milestone", async () => {
    await grantFreezesFor(A, 3);
    vi.clearAllMocks();
    await grantFreezesFor(A, 4); // still under the next milestone (6)
    expect(kv.set).not.toHaveBeenCalled();
  });
  it("preserves freezeUsedRound across a grant", async () => {
    await writeProfile(A, { freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: 6 });
    await grantFreezesFor(A, 6);
    expect((await readProfile(A))!.freezeUsedRound).toBe(6);
  });
  it("is non-fatal when the underlying KV read errors — never throws", async () => {
    // readProfile already swallows KV errors and returns null (a soft-fail
    // read, not the strict throw-on-error variant); grantFreezesFor's own
    // try/catch around readProfile is a second, redundant safety net. Either
    // way, a read blip must never surface as a thrown error to the caller —
    // it falls back to a fresh default profile.
    (kv.get as any).mockRejectedValueOnce(new Error("kv down"));
    await expect(grantFreezesFor(A, 3)).resolves.toBeUndefined();
    expect(await readProfile(A)).toEqual({
      freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null,
    });
  });
});
