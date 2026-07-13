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
  awardXp: vi.fn(),
}));

import { runOracleScan } from "./run";
import { getCurrentRound, scanAllPlayers } from "./scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "./submitter";
import { getPriorParticipants, applyLoyalty } from "./loyalty";
import { writeProvisional } from "./provisionalStore";
import { awardXp } from "./profileStore";

const VAULT = "0x000000000000000000000000000000000000ba5e" as const;
const ORACLE = "0x000000000000000000000000000000000000dead" as const;
const A = "0xAAAA000000000000000000000000000000000000" as const;

beforeEach(() => {
  vi.clearAllMocks();
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

  const result = await runOracleScan({} as any, {} as any, {
    vaultAddress: VAULT,
    oracleAddress: ORACLE,
    apiKey: "k",
  });

  // applyLoyalty received the scanned list; the boosted list reached submission.
  expect(applyLoyalty).toHaveBeenCalledWith(scanned, expect.any(Function));
  expect(checkAlreadySubmitted).toHaveBeenCalledWith({}, ORACLE, boosted);
  expect(batchSubmitStreaks).toHaveBeenCalledWith({}, {}, ORACLE, boosted);
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

  await runOracleScan({} as any, {} as any, {
    vaultAddress: VAULT,
    oracleAddress: ORACLE,
    apiKey: "k",
  });

  // scan requested all days
  expect(scanAllPlayers).toHaveBeenCalledWith(expect.anything(), "k", { closedOnly: false });
  // only the closed day (dayIndex 1) reached submission
  expect(batchSubmitStreaks).toHaveBeenCalledWith({}, {}, ORACLE, [
    { player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 },
  ]);
  // XP awarded for the closed day(s) only, with the numeric round id.
  expect(awardXp).toHaveBeenCalledWith(
    [{ player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 }],
    7
  );
  // provisional captured today's (day 2) score
  const snap = (writeProvisional as any).mock.calls[0][0];
  expect(snap.dayIndex).toBe(2);
  expect(snap.players[A.toLowerCase()]).toMatchObject({ todayScore: 5, active: true });

  vi.useRealTimers();
});
