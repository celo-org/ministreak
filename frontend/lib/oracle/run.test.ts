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

import { runOracleScan } from "./run";
import { getCurrentRound, scanAllPlayers } from "./scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "./submitter";
import { getPriorParticipants, applyLoyalty } from "./loyalty";

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
