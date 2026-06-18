import { describe, it, expect, vi } from "vitest";
import { checkAlreadySubmitted } from "./submitter";
import type { QualifyingTx } from "./scanner";
import type { PublicClient } from "viem";

const ORACLE = "0x2c08420187F96a69E0aB64a1507282786E4f474e" as const;
const PLAYER = "0x1111111111111111111111111111111111111111" as const;

function makeClient(results: Array<{ status: "success" | "failure"; result?: unknown }>) {
  return {
    multicall: vi.fn().mockResolvedValue(results),
  } as unknown as PublicClient;
}

const tx = (over: Partial<QualifyingTx>): QualifyingTx => ({
  player: PLAYER,
  roundId: 7n,
  dayIndex: 0,
  txCount: 1,
  uniqueToCount: 1,
  ...over,
});

describe("checkAlreadySubmitted", () => {
  it("returns an empty set without calling the chain when given no txs", async () => {
    const client = makeClient([]);
    const result = await checkAlreadySubmitted(client, ORACLE, []);
    expect(result.size).toBe(0);
    expect(client.multicall).not.toHaveBeenCalled();
  });

  it("includes roundId in the key so identical player+day across rounds don't collide", async () => {
    const txs = [
      tx({ roundId: 7n, dayIndex: 3 }),
      tx({ roundId: 8n, dayIndex: 3 }),
    ];
    // round 7 day 3 submitted; round 8 day 3 NOT submitted
    const client = makeClient([
      { status: "success", result: true },
      { status: "success", result: false },
    ]);

    const submitted = await checkAlreadySubmitted(client, ORACLE, txs);

    expect(submitted.has(`${PLAYER.toLowerCase()}:7:3`)).toBe(true);
    expect(submitted.has(`${PLAYER.toLowerCase()}:8:3`)).toBe(false);
    expect(submitted.size).toBe(1);
  });

  it("queries isSubmitted with (player, roundId, dayIndex) for each tx", async () => {
    const txs = [tx({ roundId: 9n, dayIndex: 5 })];
    const client = makeClient([{ status: "success", result: false }]);
    await checkAlreadySubmitted(client, ORACLE, txs);

    const calls = (client.multicall as ReturnType<typeof vi.fn>).mock.calls[0][0].contracts;
    expect(calls[0].functionName).toBe("isSubmitted");
    expect(calls[0].args).toEqual([PLAYER, 9n, 5n]);
  });

  it("ignores failed multicall entries", async () => {
    const txs = [tx({ dayIndex: 1 }), tx({ dayIndex: 2 })];
    const client = makeClient([
      { status: "failure" },
      { status: "success", result: true },
    ]);
    const submitted = await checkAlreadySubmitted(client, ORACLE, txs);
    expect(submitted.size).toBe(1);
    expect(submitted.has(`${PLAYER.toLowerCase()}:7:2`)).toBe(true);
  });
});
