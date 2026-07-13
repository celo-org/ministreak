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

import { isOnboarded, markOnboarded } from "./onboardStore";
import { kv } from "@vercel/kv";

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("onboardStore", () => {
  it("is false before, true after markOnboarded (address lower-cased)", async () => {
    expect(await isOnboarded("0xABC")).toBe(false);
    await markOnboarded("0xABC");
    expect(kv.set).toHaveBeenCalledWith("onboarded:0xabc", 1);
    expect(await isOnboarded("0xabc")).toBe(true);
  });

  it("returns true (fail-safe) when kv.get errors", async () => {
    (kv.get as any).mockRejectedValueOnce(new Error("kv down"));
    expect(await isOnboarded("0xABC")).toBe(true);
  });
});
