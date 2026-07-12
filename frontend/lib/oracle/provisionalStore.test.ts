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

import { writeProvisional, readProvisional } from "./provisionalStore";
import type { ProvisionalSnapshot } from "./provisional";
import { kv } from "@vercel/kv";

const snap: ProvisionalSnapshot = {
  roundId: "7",
  dayIndex: 2,
  updatedAt: 1000,
  players: { "0xabc": { streak: 3, todayScore: 2, todayUniqueTo: 1, active: true } },
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("provisionalStore", () => {
  it("writes under provisional:<roundId> with a TTL", async () => {
    await writeProvisional(snap);
    expect(kv.set).toHaveBeenCalledWith("provisional:7", snap, { ex: 3 * 3600 });
  });

  it("reads back the snapshot", async () => {
    await writeProvisional(snap);
    expect(await readProvisional("7")).toEqual(snap);
  });

  it("returns null on a miss", async () => {
    expect(await readProvisional("999")).toBeNull();
  });

  it("returns null (does not throw) when kv.get errors", async () => {
    (kv.get as any).mockRejectedValueOnce(new Error("kv down"));
    expect(await readProvisional("7")).toBeNull();
  });
});
