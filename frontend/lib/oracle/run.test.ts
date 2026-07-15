import { it, expect, vi, beforeEach } from "vitest";

vi.mock("./scanner", () => ({
  getCurrentRound: vi.fn(),
  scanAllPlayers: vi.fn(),
}));
vi.mock("./submitter", () => ({
  checkAlreadySubmitted: vi.fn(),
  batchSubmitStreaks: vi.fn(),
}));
vi.mock("./loyalty", () => ({
  getPriorParticipants: vi.fn(),
  loyaltyMultiplierFor: vi.fn(),
  applyLoyalty: vi.fn(),
}));
vi.mock("./provisionalStore", () => ({
  writeProvisional: vi.fn(),
}));
vi.mock("./profileStore", () => ({
  grantFreezesFor: vi.fn(),
  writeProfile: vi.fn(),
}));
vi.mock("./freeze", () => ({
  applyFreezeCovers: vi.fn(async () => ({ covered: [], charges: [] })),
  freezeEnabled: vi.fn(() => true),
}));

import { runOracleScan } from "./run";
import { getCurrentRound, scanAllPlayers } from "./scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "./submitter";
import { getPriorParticipants, applyLoyalty } from "./loyalty";
import { writeProvisional } from "./provisionalStore";
import { grantFreezesFor, writeProfile } from "./profileStore";
import { applyFreezeCovers } from "./freeze";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";

const VAULT = "0x000000000000000000000000000000000000ba5e" as const;
const ORACLE = "0x000000000000000000000000000000000000dead" as const;
const A = "0xAAAA000000000000000000000000000000000000" as const;
// Lowercased, B sorts BEFORE A ("0x1111..." < "0xaaaa..."), so the primary
// (player) sort key is actually exercised in the multi-player test below.
const B = "0x1111000000000000000000000000000000000000" as const;

// publicClient now needs a real (mocked) multicall for the on-chain freeze-XP
// pass; walletClient stays an inert stub. Referenced by identity in
// assertions below (not `{}`) since the object is no longer empty.
const publicClient = { multicall: vi.fn() } as any;
const walletClient = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: every requested contract call "succeeds" with xp 0, sized to
  // however many contracts the caller actually requests (matches whatever
  // player count a given test uses) — keeps the freeze-XP pass a normal,
  // silent success in tests that don't care about it.
  publicClient.multicall.mockImplementation(async ({ contracts }: { contracts: unknown[] }) =>
    contracts.map(() => ({ status: "success", result: 0n }))
  );
  // clearAllMocks() clears call history but not a previously-set
  // mockResolvedValue, so re-pin the freeze-cover default here to avoid a
  // later test's override (e.g. "sorts a multi-player batch") leaking into
  // whichever test runs next.
  (applyFreezeCovers as any).mockResolvedValue({ covered: [], charges: [] });
});

it("applies loyalty to qualifying streaks before submitting", async () => {
  (getCurrentRound as any).mockResolvedValue({
    roundId: 7n,
    startTime: 0n,
    endTime: 0n,
    players: [A],
    vaultAddress: VAULT,
  });
  const scanned = [{ player: A, roundId: 7n, dayIndex: 0, txCount: 2, uniqueToCount: 2 }];
  const boosted = [{ player: A, roundId: 7n, dayIndex: 0, txCount: 4, uniqueToCount: 2 }];
  (scanAllPlayers as any).mockResolvedValue(scanned);
  (getPriorParticipants as any).mockResolvedValue({ prev: new Set(), prev2: new Set() });
  (applyLoyalty as any).mockReturnValue(boosted);
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");

  const result = await runOracleScan(publicClient, walletClient, {
    vaultAddress: VAULT,
    oracleAddress: ORACLE,
    apiKey: "k",
  });

  // applyLoyalty received the scanned list; the boosted list reached submission.
  expect(applyLoyalty).toHaveBeenCalledWith(scanned, expect.any(Function));
  expect(checkAlreadySubmitted).toHaveBeenCalledWith(publicClient, ORACLE, boosted);
  expect(batchSubmitStreaks).toHaveBeenCalledWith(walletClient, publicClient, ORACLE, boosted);
  expect(result.streaksSubmitted).toBe(1);
});

it("submits only closed days and writes today's provisional to KV", async () => {
  vi.useFakeTimers();
  // now = Wed 12:00Z; round started Mon 00:00Z -> currentDayIndex = 2 (Wed open)
  vi.setSystemTime(Date.UTC(2026, 0, 7, 12, 0, 0));
  const start = BigInt(Math.floor(Date.UTC(2026, 0, 5, 0, 0, 0) / 1000));

  (getCurrentRound as any).mockResolvedValue({
    roundId: 7n,
    startTime: start,
    endTime: start + BigInt(7 * 86400),
    players: [A],
    vaultAddress: VAULT,
  });
  // day 1 closed (submit) + day 2 open (provisional)
  const scanned = [
    { player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 },
    { player: A, roundId: 7n, dayIndex: 2, txCount: 5, uniqueToCount: 3 },
  ];
  (scanAllPlayers as any).mockResolvedValue(scanned);
  (getPriorParticipants as any).mockResolvedValue({ prev: new Set(), prev2: new Set() });
  (applyLoyalty as any).mockImplementation((q: any[]) => q); // identity
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");
  (writeProvisional as any).mockResolvedValue(undefined);
  publicClient.multicall.mockResolvedValue([{ status: "success", result: 259n }]); // level 3

  await runOracleScan(publicClient, walletClient, {
    vaultAddress: VAULT,
    oracleAddress: ORACLE,
    apiKey: "k",
  });

  // scan requested all days
  expect(scanAllPlayers).toHaveBeenCalledWith(expect.anything(), "k", { closedOnly: false });
  // only the closed day (dayIndex 1) reached submission
  expect(batchSubmitStreaks).toHaveBeenCalledWith(walletClient, publicClient, ORACLE, [
    { player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 },
  ]);
  // No off-chain XP award anymore (profileStore no longer exports awardXp —
  // enforced at compile time). On-chain XP was read via multicall for every
  // round player, and the freeze grant was re-derived from that XP's level
  // (259 XP -> level 3).
  expect(publicClient.multicall).toHaveBeenCalledWith({
    contracts: [{ address: XP_ADDRESS, abi: XP_ABI, functionName: "xp", args: [A] }],
    allowFailure: true,
  });
  expect(grantFreezesFor).toHaveBeenCalledWith(A, 3);
  // provisional captured today's (day 2) score
  const snap = (writeProvisional as any).mock.calls[0][0];
  expect(snap.dayIndex).toBe(2);
  expect(snap.players[A.toLowerCase()]).toMatchObject({ todayScore: 5, active: true });

  vi.useRealTimers();
});

it("merges freeze covers into the batch, sorted so the covered day precedes the return day", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 7, 12, 0, 0)); // currentDayIndex 2 for a Mon-00:00 start
  const start = BigInt(Math.floor(Date.UTC(2026, 0, 5, 0, 0, 0) / 1000));
  (getCurrentRound as any).mockResolvedValue({
    roundId: 7n, startTime: start, endTime: start + BigInt(7 * 86400), players: [A], vaultAddress: VAULT,
  });
  // return day 1 is the only closed active day; freeze covers day 0
  (scanAllPlayers as any).mockResolvedValue([{ player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 }]);
  (getPriorParticipants as any).mockResolvedValue({ prev: new Set(), prev2: new Set() });
  (applyLoyalty as any).mockImplementation((q: any[]) => q);
  const chargedProfile = { freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null };
  (applyFreezeCovers as any).mockResolvedValue({
    covered: [{ player: A, roundId: 7n, dayIndex: 0, txCount: 0, uniqueToCount: 0 }],
    charges: [{ key: A.toLowerCase(), profile: chargedProfile }],
  });
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");

  await runOracleScan(publicClient, walletClient, { vaultAddress: VAULT, oracleAddress: ORACLE, apiKey: "k" });

  const submittedBatch = (batchSubmitStreaks as any).mock.calls[0][3];
  expect(submittedBatch.map((q: any) => q.dayIndex)).toEqual([0, 1]); // covered day 0 before return day 1
  // Freeze token is charged only AFTER the batch submit succeeds, with the token decremented.
  expect(writeProfile).toHaveBeenCalledWith(
    A.toLowerCase(),
    expect.objectContaining({ freezeTokens: 0, freezeUsedRound: 7 })
  );
  const batchOrder = (batchSubmitStreaks as any).mock.invocationCallOrder[0];
  const writeOrder = (writeProfile as any).mock.invocationCallOrder[0];
  expect(writeOrder).toBeGreaterThan(batchOrder);
  vi.useRealTimers();
});

it("sorts a multi-player batch by (player, dayIndex) — not by dayIndex alone", async () => {
  // Regression guard: a single-player test can't distinguish sort((a,b) => a.dayIndex - b.dayIndex)
  // from the required sort((a,b) => player.localeCompare(...) || a.dayIndex - b.dayIndex). With two
  // players whose covered/return dayIndexes are on opposite ends of the range (B high, A low), the
  // two sort strategies produce different overall orderings, so a regression to dayIndex-only sort
  // is caught here even though it would still pass the single-player "merges freeze covers" test above.
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 11, 12, 0, 0)); // Sun noon -> currentDayIndex 6 for a Mon-00:00 start
  const start = BigInt(Math.floor(Date.UTC(2026, 0, 5, 0, 0, 0) / 1000));
  (getCurrentRound as any).mockResolvedValue({
    roundId: 7n, startTime: start, endTime: start + BigInt(7 * 86400), players: [A, B], vaultAddress: VAULT,
  });
  // B's return day (5) is high; A's return day (1) is low.
  (scanAllPlayers as any).mockResolvedValue([
    { player: B, roundId: 7n, dayIndex: 5, txCount: 2, uniqueToCount: 2 },
    { player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 },
  ]);
  (getPriorParticipants as any).mockResolvedValue({ prev: new Set(), prev2: new Set() });
  (applyLoyalty as any).mockImplementation((q: any[]) => q);
  // B's freeze cover (4) and A's freeze cover (0), matching each player's return day.
  (applyFreezeCovers as any).mockResolvedValue({
    covered: [
      { player: B, roundId: 7n, dayIndex: 4, txCount: 0, uniqueToCount: 0 },
      { player: A, roundId: 7n, dayIndex: 0, txCount: 0, uniqueToCount: 0 },
    ],
    charges: [],
  });
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");

  await runOracleScan(publicClient, walletClient, { vaultAddress: VAULT, oracleAddress: ORACLE, apiKey: "k" });

  const submittedBatch = (batchSubmitStreaks as any).mock.calls[0][3];
  // Correct (player, then dayIndex) order: B's pair (lower lowercased address) first, each
  // player's covered day immediately before its own return day.
  expect(submittedBatch.map((q: any) => [q.player, q.dayIndex])).toEqual([
    [B, 4],
    [B, 5],
    [A, 0],
    [A, 1],
  ]);
  // A naive `sort((a,b) => a.dayIndex - b.dayIndex)` (dropping the player key) would instead
  // yield [A:0, A:1, B:4, B:5] — a different array from the one asserted above — so this test
  // fails against that regression while the single-player "merges freeze covers" test would not.
  vi.useRealTimers();
});

it("treats a failed on-chain XP read (allowFailure) as xp 0 -> level 1", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 7, 12, 0, 0));
  const start = BigInt(Math.floor(Date.UTC(2026, 0, 5, 0, 0, 0) / 1000));
  (getCurrentRound as any).mockResolvedValue({
    roundId: 7n, startTime: start, endTime: start + BigInt(7 * 86400), players: [A], vaultAddress: VAULT,
  });
  (scanAllPlayers as any).mockResolvedValue([
    { player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 },
  ]);
  (getPriorParticipants as any).mockResolvedValue({ prev: new Set(), prev2: new Set() });
  (applyLoyalty as any).mockImplementation((q: any[]) => q);
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");
  publicClient.multicall.mockResolvedValue([{ status: "failure", error: new Error("revert") }]);

  await runOracleScan(publicClient, walletClient, { vaultAddress: VAULT, oracleAddress: ORACLE, apiKey: "k" });

  expect(grantFreezesFor).toHaveBeenCalledWith(A, 1);
  vi.useRealTimers();
});

it("swallows a freeze-grant pass failure without aborting the run (non-fatal)", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 7, 12, 0, 0));
  const start = BigInt(Math.floor(Date.UTC(2026, 0, 5, 0, 0, 0) / 1000));
  (getCurrentRound as any).mockResolvedValue({
    roundId: 7n, startTime: start, endTime: start + BigInt(7 * 86400), players: [A], vaultAddress: VAULT,
  });
  (scanAllPlayers as any).mockResolvedValue([
    { player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 },
  ]);
  (getPriorParticipants as any).mockResolvedValue({ prev: new Set(), prev2: new Set() });
  (applyLoyalty as any).mockImplementation((q: any[]) => q);
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");
  publicClient.multicall.mockRejectedValue(new Error("rpc down"));

  const result = await runOracleScan(publicClient, walletClient, { vaultAddress: VAULT, oracleAddress: ORACLE, apiKey: "k" });

  expect(grantFreezesFor).not.toHaveBeenCalled();
  // The rest of the run still completes and submits normally.
  expect(result.streaksSubmitted).toBe(1);
  vi.useRealTimers();
});
