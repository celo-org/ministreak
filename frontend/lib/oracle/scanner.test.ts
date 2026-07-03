import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getRoundDayWindows,
  analyzePlayerTxsByDay,
  scanAllPlayers,
  type RoundInfo,
} from "./scanner";

const DAY = 86400;

// A fixed "now" so day-window math is deterministic.
// 2026-01-08T12:00:00Z (a Thursday), well inside a round that started Monday.
const NOW_MS = Date.UTC(2026, 0, 8, 12, 0, 0);
const ROUND_START = BigInt(Math.floor(Date.UTC(2026, 0, 5, 0, 0, 0) / 1000)); // Mon 2026-01-05 00:00Z
const VAULT = "0x000000000000000000000000000000000000ba5e" as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("getRoundDayWindows", () => {
  it("produces one window per elapsed UTC day from round start through today", () => {
    const windows = getRoundDayWindows(ROUND_START);
    // Mon..Thu inclusive = dayIndex 0,1,2,3
    expect(windows.map((w) => w.dayIndex)).toEqual([0, 1, 2, 3]);
  });

  it("aligns each window to a full UTC day (start at midnight, end at 23:59:59)", () => {
    const [first] = getRoundDayWindows(ROUND_START);
    expect(first.start).toBe(Number(ROUND_START));
    expect(first.end).toBe(Number(ROUND_START) + DAY - 1);
  });

  it("never returns dayIndex outside 0..6", () => {
    const windows = getRoundDayWindows(ROUND_START);
    for (const w of windows) {
      expect(w.dayIndex).toBeGreaterThanOrEqual(0);
      expect(w.dayIndex).toBeLessThanOrEqual(6);
    }
  });

  it("returns no windows for a round that starts in the future", () => {
    const future = BigInt(Math.floor(NOW_MS / 1000) + 10 * DAY);
    expect(getRoundDayWindows(future)).toEqual([]);
  });

  it("includes day 0 when the round started mid-day today (drifted, non-midnight start)", () => {
    // Regression: round starts at 09:00Z today, 'now' is 12:00Z the same day.
    // The old midnight-aligned logic produced zero windows here, so the entry
    // day never got scanned and streaks stayed 0. 09:00 is >6h from midnight,
    // so it is NOT snapped — windows align to the actual start.
    const midDayStart = BigInt(Math.floor(Date.UTC(2026, 0, 8, 9, 0, 0) / 1000));
    const windows = getRoundDayWindows(midDayStart);
    expect(windows.map((w) => w.dayIndex)).toEqual([0]);
    expect(windows[0].start).toBe(Number(midDayStart));
    expect(windows[0].end).toBe(Number(midDayStart) + DAY - 1);
  });

  it("snaps a near-midnight start so windows align to UTC calendar days", () => {
    // Round resolved at 00:20Z on Jan 8 (a few minutes past midnight). 'now' is
    // 12:00Z Jan 8, so we're in day 0 — its window must be the full calendar day.
    const nearMidnightStart = BigInt(Math.floor(Date.UTC(2026, 0, 8, 0, 20, 0) / 1000));
    const midnight = Math.floor(Date.UTC(2026, 0, 8, 0, 0, 0) / 1000);
    const windows = getRoundDayWindows(nearMidnightStart);
    expect(windows.map((w) => w.dayIndex)).toEqual([0]);
    expect(windows[0].start).toBe(midnight);
    expect(windows[0].end).toBe(midnight + DAY - 1);
  });
});

describe("analyzePlayerTxsByDay", () => {
  const player = "0x1111111111111111111111111111111111111111" as const;
  const roundInfo: RoundInfo = {
    roundId: 7n,
    startTime: ROUND_START,
    endTime: ROUND_START + BigInt(7 * DAY),
    players: [player],
    vaultAddress: VAULT,
  };
  const windows = [
    { dayIndex: 0, start: Number(ROUND_START), end: Number(ROUND_START) + DAY - 1 },
    { dayIndex: 1, start: Number(ROUND_START) + DAY, end: Number(ROUND_START) + 2 * DAY - 1 },
  ];

  it("filters out self-sends", () => {
    const txs = [
      { to: player, timestamp: windows[0].start + 10 }, // self-send -> ignored
    ];
    expect(analyzePlayerTxsByDay(player, txs, roundInfo, windows)).toEqual([]);
  });

  it("filters out null-recipient txs (contract creations)", () => {
    const txs = [{ to: null, timestamp: windows[0].start + 10 }];
    expect(analyzePlayerTxsByDay(player, txs, roundInfo, windows)).toEqual([]);
  });

  it("counts txs and unique recipients per day, carrying roundId", () => {
    const txs = [
      { to: "0xAAAA000000000000000000000000000000000000", timestamp: windows[0].start + 10 },
      { to: "0xaaaa000000000000000000000000000000000000", timestamp: windows[0].start + 20 }, // same recipient, diff case
      { to: "0xBBBB000000000000000000000000000000000000", timestamp: windows[0].start + 30 },
    ];
    const result = analyzePlayerTxsByDay(player, txs, roundInfo, windows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      player,
      roundId: 7n,
      dayIndex: 0,
      txCount: 3,
      uniqueToCount: 2, // AAAA (deduped across casing) + BBBB
    });
  });

  it("produces a separate entry per qualifying day", () => {
    const txs = [
      { to: "0xAAAA000000000000000000000000000000000000", timestamp: windows[0].start + 5 },
      { to: "0xBBBB000000000000000000000000000000000000", timestamp: windows[1].start + 5 },
    ];
    const result = analyzePlayerTxsByDay(player, txs, roundInfo, windows);
    expect(result.map((r) => r.dayIndex)).toEqual([0, 1]);
  });

  it("ignores txs outside any day window", () => {
    const txs = [{ to: "0xAAAA000000000000000000000000000000000000", timestamp: windows[1].end + 10_000 }];
    expect(analyzePlayerTxsByDay(player, txs, roundInfo, windows)).toEqual([]);
  });

  it("counts only txs after entry — excludes approve, prior-round claims, and the entry itself", () => {
    const s = windows[0].start;
    const txs = [
      { to: VAULT, timestamp: s + 5, method: "claimRefund" }, // prior round -> excluded
      { to: "0xUSDT000000000000000000000000000000000000", timestamp: s + 8, method: "approve" }, // pre-entry -> excluded
      { to: VAULT, timestamp: s + 10, method: "enterRound" }, // entry (counted on-chain, not here)
      { to: "0xAAAA000000000000000000000000000000000000", timestamp: s + 20, method: "transfer" }, // post-entry -> counts
    ];
    const result = analyzePlayerTxsByDay(player, txs, roundInfo, windows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ dayIndex: 0, txCount: 1, uniqueToCount: 1 });
  });

  it("entry day still qualifies for streak with zero post-entry txs (txCount 0)", () => {
    const txs = [
      { to: VAULT, timestamp: windows[0].start + 10, method: "enterRound" },
    ];
    const result = analyzePlayerTxsByDay(player, txs, roundInfo, windows);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ dayIndex: 0, txCount: 0, uniqueToCount: 0 });
  });
});

describe("scanAllPlayers (integration over mocked Blockscout fetch)", () => {
  const player = "0x1111111111111111111111111111111111111111" as const;
  const roundInfo: RoundInfo = {
    roundId: 7n,
    startTime: ROUND_START,
    endTime: ROUND_START + BigInt(7 * DAY),
    players: [player],
    vaultAddress: VAULT,
  };

  // Stubs the Blockscout fetch. Etherscan is skipped (no ETHERSCAN_API_KEY in
  // tests), so only this source feeds the union. Items include a hash, which the
  // union dedups on.
  function stubFetchOnce(items: Array<{ to: string | null; ts: number }>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: items.map((i, idx) => ({
            hash: `0x${(i.ts * 1000 + idx).toString(16).padStart(64, "0")}`,
            timestamp: new Date(i.ts * 1000).toISOString(),
            to: i.to ? { hash: i.to } : undefined,
          })),
          // no next_page_params -> single page
        }),
      })
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a qualifying entry per day with valid outgoing txs", async () => {
    const day0 = Number(ROUND_START) + 100;
    stubFetchOnce([
      { to: "0xAAAA000000000000000000000000000000000000", ts: day0 },
      { to: player, ts: day0 + 5 }, // self-send -> excluded
    ]);

    const result = await scanAllPlayers(roundInfo, "fake-key");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ roundId: 7n, dayIndex: 0, txCount: 1, uniqueToCount: 1 });
  });

  it("returns nothing when a player has no outgoing txs", async () => {
    stubFetchOnce([]);
    expect(await scanAllPlayers(roundInfo, "fake-key")).toEqual([]);
  });

  it("returns nothing when there are no day windows yet (future round)", async () => {
    stubFetchOnce([]);
    const future: RoundInfo = {
      ...roundInfo,
      startTime: BigInt(Math.floor(NOW_MS / 1000) + 10 * DAY),
    };
    expect(await scanAllPlayers(future, "fake-key")).toEqual([]);
  });
});
