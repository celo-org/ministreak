import { describe, it, expect, vi } from "vitest";
import {
  getPriorParticipants,
  loyaltyMultiplierFor,
  applyLoyalty,
  type PriorParticipation,
} from "./loyalty";
import type { QualifyingTx } from "./scanner";

const A = "0xAAAA000000000000000000000000000000000000";
const B = "0xBBBB000000000000000000000000000000000000";
const C = "0xCCCC000000000000000000000000000000000000";
const VAULT = "0x000000000000000000000000000000000000ba5e" as const;

describe("loyaltyMultiplierFor", () => {
  const parts: PriorParticipation = {
    prev: new Set([A.toLowerCase(), B.toLowerCase()]),
    prev2: new Set([A.toLowerCase()]),
  };
  it("gives 2x when the player entered both prior rounds", () => {
    expect(loyaltyMultiplierFor(A, parts)).toBe(2.0);
  });
  it("gives 1.5x when the player entered only the last round", () => {
    expect(loyaltyMultiplierFor(B, parts)).toBe(1.5);
  });
  it("gives 1x when the player entered neither", () => {
    expect(loyaltyMultiplierFor(C, parts)).toBe(1.0);
  });
  it("matches addresses case-insensitively", () => {
    expect(loyaltyMultiplierFor(A.toUpperCase() as `0x${string}`, parts)).toBe(2.0);
  });
});

describe("applyLoyalty", () => {
  const base: QualifyingTx[] = [
    { player: A, roundId: 7n, dayIndex: 0, txCount: 4, uniqueToCount: 3 },
    { player: C, roundId: 7n, dayIndex: 0, txCount: 4, uniqueToCount: 3 },
  ];
  it("multiplies txCount and rounds, leaving uniqueToCount untouched", () => {
    const out = applyLoyalty(base, (p) => (p === A ? 1.5 : 1.0));
    expect(out[0]).toMatchObject({ player: A, txCount: 6, uniqueToCount: 3 }); // 4 * 1.5 = 6
    expect(out[1]).toMatchObject({ player: C, txCount: 4, uniqueToCount: 3 }); // 1x unchanged
  });
  it("does not mutate the input array entries", () => {
    applyLoyalty(base, () => 2.0);
    expect(base[0].txCount).toBe(4);
  });
});

describe("getPriorParticipants", () => {
  function clientReturning(byRound: Record<string, string[]>) {
    return {
      readContract: vi.fn(async ({ args }: { args: readonly [bigint] }) => {
        const players = byRound[args[0].toString()];
        if (!players) throw new Error("no such round");
        return players;
      }),
    } as any;
  }

  it("reads rounds N-1 and N-2 into lowercased sets", async () => {
    const client = clientReturning({ "6": [A, B], "5": [A] });
    const parts = await getPriorParticipants(client, VAULT, 7n);
    expect(parts.prev).toEqual(new Set([A.toLowerCase(), B.toLowerCase()]));
    expect(parts.prev2).toEqual(new Set([A.toLowerCase()]));
  });

  it("returns empty sets for round 1 (no prior rounds) without reverting", async () => {
    const client = clientReturning({});
    const parts = await getPriorParticipants(client, VAULT, 1n);
    expect(parts.prev).toEqual(new Set());
    expect(parts.prev2).toEqual(new Set());
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it("treats a read error as no participation (empty set)", async () => {
    const client = clientReturning({ "6": [A] }); // round 5 read throws
    const parts = await getPriorParticipants(client, VAULT, 7n);
    expect(parts.prev).toEqual(new Set([A.toLowerCase()]));
    expect(parts.prev2).toEqual(new Set());
  });
});
