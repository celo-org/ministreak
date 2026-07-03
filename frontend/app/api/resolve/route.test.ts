import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock viem so no real chain calls happen; keep the real parseAbi/http.
const writeContract = vi.fn();
const waitForTransactionReceipt = vi.fn();
const getGasPrice = vi.fn();
const readContract = vi.fn();

vi.mock("viem", async (orig) => {
  const actual = await orig<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract,
      getGasPrice,
      waitForTransactionReceipt,
    })),
    createWalletClient: vi.fn(() => ({ writeContract })),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: "0xKEEPER" })),
}));

import { GET } from "./route";

const DAY = 86400;
const ROUND_ID = 5n;

// The route now gates on the snapped 7-day end derived from startTime, so the
// mock sets startTime (index 0). endTime (index 1) is kept consistent but unused.
function mockRound(startTime: number, status: number) {
  readContract.mockImplementation(({ functionName }: { functionName: string }) => {
    if (functionName === "getCurrentRoundId") return Promise.resolve(ROUND_ID);
    if (functionName === "rounds")
      return Promise.resolve([BigInt(startTime), BigInt(startTime + 7 * DAY), 0n, status, 0n]);
    return Promise.reject(new Error(`unexpected call ${functionName}`));
  });
}

const req = () => new Request("http://localhost/api/resolve");
const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_VAULT_ADDRESS", "0xcd125da0EC85c8414D39fa94011b607C2A5f17e5");
  vi.stubEnv("ORACLE_PRIVATE_KEY", "0x" + "1".repeat(64));
  vi.stubEnv("CRON_SECRET", ""); // auth disabled for the test
  getGasPrice.mockResolvedValue(1_000_000_000n);
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  writeContract.mockResolvedValue("0xtxhash");
});

describe("GET /api/resolve", () => {
  it("is a no-op while the round has not ended", async () => {
    mockRound(nowSec(), 0 /* Open */); // just started -> effectiveEnd ~7d away
    const res = await GET(req());
    const body = await res.json();
    expect(body.action).toBe("skipped");
    expect(body.reason).toBe("round not ended");
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("is a no-op when the round is already resolved", async () => {
    mockRound(nowSec() - 8 * DAY, 2 /* Resolved */); // ended, but already resolved
    const res = await GET(req());
    const body = await res.json();
    expect(body.action).toBe("skipped");
    expect(body.reason).toContain("already resolved");
    expect(writeContract).not.toHaveBeenCalled();
  });

  it("resolves once the round has ended and is still Open", async () => {
    mockRound(nowSec() - 8 * DAY, 0 /* Open */); // ended -> resolves
    const res = await GET(req());
    const body = await res.json();
    expect(body.action).toBe("resolved");
    expect(body.round).toBe(Number(ROUND_ID));
    expect(body.txHash).toBe("0xtxhash");
    expect(writeContract).toHaveBeenCalledOnce();
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "resolveRound", args: [ROUND_ID] })
    );
  });

  it("returns 500 when a required env var is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAULT_ADDRESS", "");
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Missing required env vars");
  });

  it("rejects an unauthorized request when CRON_SECRET is set", async () => {
    vi.stubEnv("CRON_SECRET", "supersecret");
    const res = await GET(req()); // no Authorization header
    expect(res.status).toBe(401);
  });

  it("surfaces a reverted tx as an error", async () => {
    mockRound(nowSec() - 8 * DAY, 1 /* Closed */); // ended -> attempts resolve
    waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});
