# Phase 1 — Score Engine (Anti-Farm + Loyalty) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the farmable raw `txCount` tiebreaker with a rate-capped, loyalty-weighted **Score** computed off-chain in the oracle and submitted as the on-chain `txCount`, and relabel it "Score" in the UI — with no contract change.

**Architecture:** All work is in `frontend/` (the oracle lives here). A pure rate-cap helper trims a day's counted txs to at most one per 30-min window; `uniqueToCount` is recomputed over that same capped set. A loyalty module reads prior-round rosters on-chain and multiplies each player's daily Score by 1.5×/2×. Day submission moves to *day-close only* (so a full day is capped before the on-chain once-only guard locks it), paired with an optimistic client-side "Today's in" so the live feel is preserved. Finally the UI relabels `txCount` → "Score".

**Tech Stack:** Next.js 14, TypeScript, viem, wagmi + @tanstack/react-query, Vitest + @testing-library/react.

## Global Constraints

- **Off-chain only. No contract change, no redeploy.** Everything routes through the `txCount`/`uniqueToCount` values the scanner submits via `recordStreak`.
- **`streak` stays the primary rank key.** Score/uniqueTo only break ties among equal streaks. Never fabricate or inflate `streak`.
- **Rate cap:** at most **1 counted tx per `RATE_WINDOW_SECONDS` (default 30 min = 1800s)**.
- **Loyalty multiplier:** entered last round → **1.5×**; entered **2+ consecutive** prior rounds → **2.0×** (cap); otherwise **1.0×**. Applied to `txCount` only, never to `uniqueToCount`.
- **Submission timing:** submit a day's streak **only after that day has closed** (`window.end < now`). Preserve live feel with optimistic UI.
- **UI:** relabel `txCount` → **"Score"** (unit "pts"); tooltip copy: `rate-capped activity — spamming doesn't help`.
- **All commands run from `frontend/`.** Test runner: `npm test` (`vitest run`); single file: `npx vitest run <path>`.
- **TDD, DRY, YAGNI, one commit per task.**

---

### Task 1: Score config + rate-cap helper (pure)

**Files:**
- Create: `frontend/lib/oracle/scoreConfig.ts`
- Create: `frontend/lib/oracle/rateCap.ts`
- Test: `frontend/lib/oracle/rateCap.test.ts`

**Interfaces:**
- Produces: `RATE_WINDOW_SECONDS: number` and `LOYALTY: { NONE: 1.0; ENTERED_LAST: 1.5; ENTERED_TWO_PLUS: 2.0 }` from `scoreConfig.ts`; `rateCapTxs<T extends { timestamp: number }>(txs: T[], windowSeconds: number): T[]` from `rateCap.ts` — returns a new array keeping the earliest tx and then only txs at least `windowSeconds` after the last kept one.

- [ ] **Step 1: Write the config module**

Create `frontend/lib/oracle/scoreConfig.ts`:

```ts
/**
 * scoreConfig.ts
 * Tunable knobs for the off-chain Score engine (anti-farm rate cap + loyalty).
 * Kept in one place so parameters can be adjusted without touching logic.
 */

/** Anti-farm: at most one counted tx per this many seconds (default 30 min). */
export const RATE_WINDOW_SECONDS = 30 * 60;

/** Loyalty multipliers applied to a player's daily Score (txCount). */
export const LOYALTY = {
  NONE: 1.0,
  ENTERED_LAST: 1.5,
  ENTERED_TWO_PLUS: 2.0,
} as const;
```

- [ ] **Step 2: Write the failing test**

Create `frontend/lib/oracle/rateCap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rateCapTxs } from "./rateCap";

const W = 1800; // 30 min

describe("rateCapTxs", () => {
  it("keeps a single tx", () => {
    const txs = [{ timestamp: 100 }];
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 100 }]);
  });

  it("collapses a burst inside one window to a single counted tx", () => {
    const txs = [{ timestamp: 100 }, { timestamp: 200 }, { timestamp: 900 }];
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 100 }]);
  });

  it("counts txs spaced at least one window apart", () => {
    const txs = [{ timestamp: 0 }, { timestamp: 1800 }, { timestamp: 3600 }];
    expect(rateCapTxs(txs, W)).toEqual([
      { timestamp: 0 },
      { timestamp: 1800 },
      { timestamp: 3600 },
    ]);
  });

  it("uses exactly-window boundary as counted (>=, not >)", () => {
    const txs = [{ timestamp: 0 }, { timestamp: 1799 }, { timestamp: 1800 }];
    // 1799 is inside the window (dropped); 1800 is exactly a window later (kept).
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 0 }, { timestamp: 1800 }]);
  });

  it("sorts unsorted input before capping and does not mutate the input", () => {
    const txs = [{ timestamp: 3600 }, { timestamp: 100 }, { timestamp: 200 }];
    const copy = [...txs];
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 100 }, { timestamp: 3600 }]);
    expect(txs).toEqual(copy);
  });

  it("returns empty for empty input", () => {
    expect(rateCapTxs([], W)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/oracle/rateCap.test.ts`
Expected: FAIL — `Failed to resolve import "./rateCap"` / `rateCapTxs is not a function`.

- [ ] **Step 4: Write the minimal implementation**

Create `frontend/lib/oracle/rateCap.ts`:

```ts
/**
 * rateCap.ts
 * Anti-farm rate cap: from a set of txs, keep at most one per time window.
 * Greedy earliest-first — keeps the first tx, then only txs that fall at least
 * `windowSeconds` after the last kept one. Pure; does not mutate its input.
 */
export function rateCapTxs<T extends { timestamp: number }>(
  txs: T[],
  windowSeconds: number
): T[] {
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  const kept: T[] = [];
  let lastKept = -Infinity;
  for (const tx of sorted) {
    if (tx.timestamp - lastKept >= windowSeconds) {
      kept.push(tx);
      lastKept = tx.timestamp;
    }
  }
  return kept;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/oracle/rateCap.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/scoreConfig.ts frontend/lib/oracle/rateCap.ts frontend/lib/oracle/rateCap.test.ts
git commit -m "feat(oracle): add rate-cap helper + score config (anti-farm)"
```

---

### Task 2: Apply the rate cap inside the scanner

**Files:**
- Modify: `frontend/lib/oracle/scanner.ts` (`analyzePlayerTxsByDay`, ~lines 263-312)
- Test: `frontend/lib/oracle/scanner.test.ts` (update one existing test, add two)

**Interfaces:**
- Consumes: `rateCapTxs` and `RATE_WINDOW_SECONDS` from Task 1.
- Produces: unchanged signature `analyzePlayerTxsByDay(player, txs, roundInfo, dayWindows): QualifyingTx[]`, but `txCount` is now the rate-capped count and `uniqueToCount` is distinct recipients **among the counted txs**.

- [ ] **Step 1: Update the existing multi-recipient test to space txs across windows**

In `frontend/lib/oracle/scanner.test.ts`, replace the test titled `"counts txs and unique recipients per day, carrying roundId"` (currently lines ~101-116) with this — timestamps are now spaced ≥ one 30-min window apart so all three still count (this test asserts recipient dedup, not the cap):

```ts
  it("counts txs and unique recipients per day, carrying roundId", () => {
    const txs = [
      { to: "0xAAAA000000000000000000000000000000000000", timestamp: windows[0].start + 10 },
      { to: "0xaaaa000000000000000000000000000000000000", timestamp: windows[0].start + 1810 }, // +30m10s, same recipient diff case
      { to: "0xBBBB000000000000000000000000000000000000", timestamp: windows[0].start + 3620 }, // +60m20s
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
```

- [ ] **Step 2: Add two rate-cap tests**

In `frontend/lib/oracle/scanner.test.ts`, add these inside the `describe("analyzePlayerTxsByDay", ...)` block, after the test from Step 1:

```ts
  it("rate-caps a same-window burst to a single counted tx (anti-farm)", () => {
    const s = windows[0].start;
    const txs = [
      { to: "0xAAAA000000000000000000000000000000000000", timestamp: s + 10 },
      { to: "0xBBBB000000000000000000000000000000000000", timestamp: s + 20 },
      { to: "0xCCCC000000000000000000000000000000000000", timestamp: s + 30 },
    ];
    const result = analyzePlayerTxsByDay(player, txs, roundInfo, windows);
    expect(result).toHaveLength(1);
    // Only the first tx of the window counts.
    expect(result[0]).toMatchObject({ dayIndex: 0, txCount: 1, uniqueToCount: 1 });
  });

  it("counts uniqueTo only over the rate-capped set", () => {
    const s = windows[0].start;
    const txs = [
      { to: "0xAAAA000000000000000000000000000000000000", timestamp: s + 10 },
      { to: "0xBBBB000000000000000000000000000000000000", timestamp: s + 20 }, // same window -> dropped
      { to: "0xCCCC000000000000000000000000000000000000", timestamp: s + 1810 }, // next window -> counted
    ];
    const result = analyzePlayerTxsByDay(player, txs, roundInfo, windows);
    expect(result[0]).toMatchObject({ dayIndex: 0, txCount: 2, uniqueToCount: 2 }); // AAAA + CCCC
  });
```

- [ ] **Step 3: Run tests to verify the new/updated ones fail**

Run: `npx vitest run lib/oracle/scanner.test.ts -t "rate-cap"`
Expected: FAIL — burst test currently returns `txCount: 3` (no cap yet).

- [ ] **Step 4: Apply the rate cap in `analyzePlayerTxsByDay`**

In `frontend/lib/oracle/scanner.ts`, add the import near the top (after the existing `roundDay` import, line ~12):

```ts
import { rateCapTxs } from "./rateCap";
import { RATE_WINDOW_SECONDS } from "./scoreConfig";
```

Then, inside `analyzePlayerTxsByDay`, replace this block (currently ~lines 297-308):

```ts
    const uniqueToAddresses = new Set<string>();
    for (const tx of dayTxs) {
      uniqueToAddresses.add(tx.to!.toLowerCase());
    }

    results.push({
      player,
      roundId: roundInfo.roundId,
      dayIndex,
      txCount: dayTxs.length,
      uniqueToCount: uniqueToAddresses.size,
    });
```

with:

```ts
    // Anti-farm: count at most one tx per RATE_WINDOW_SECONDS. uniqueToCount is
    // measured over the SAME capped set so both tiebreakers derive from one
    // consistent set (closes the alt-spam hole on the tertiary key).
    const counted = rateCapTxs(dayTxs, RATE_WINDOW_SECONDS);
    const uniqueToAddresses = new Set<string>();
    for (const tx of counted) {
      uniqueToAddresses.add(tx.to!.toLowerCase());
    }

    results.push({
      player,
      roundId: roundInfo.roundId,
      dayIndex,
      txCount: counted.length,
      uniqueToCount: uniqueToAddresses.size,
    });
```

- [ ] **Step 5: Run the full scanner suite**

Run: `npx vitest run lib/oracle/scanner.test.ts`
Expected: PASS. (Entry-day-zero, self-send, null-recipient, after-entry, and per-day tests are unaffected because each already has ≤1 post-entry tx per window; the multi-recipient test was re-spaced in Step 1.)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/scanner.ts frontend/lib/oracle/scanner.test.ts
git commit -m "feat(oracle): rate-cap counted txs + uniqueTo over capped set"
```

---

### Task 3: Loyalty module (prior-round participation → multiplier)

**Files:**
- Create: `frontend/lib/oracle/loyalty.ts`
- Test: `frontend/lib/oracle/loyalty.test.ts`

**Interfaces:**
- Consumes: `LOYALTY` from Task 1; `QualifyingTx` type from `./scanner`.
- Produces:
  - `getPriorParticipants(client: PublicClient, vaultAddress: Address, roundId: bigint): Promise<PriorParticipation>` where `PriorParticipation = { prev: Set<string>; prev2: Set<string> }` (lowercased addresses from `getRoundPlayers(roundId-1)` and `getRoundPlayers(roundId-2)`; empty sets for non-existent rounds or read errors).
  - `loyaltyMultiplierFor(player: Address, parts: PriorParticipation): number` — 2.0 if in both prev & prev2, 1.5 if in prev only, else 1.0.
  - `applyLoyalty(qualifying: QualifyingTx[], multiplierFor: (player: Address) => number): QualifyingTx[]` — returns new entries with `txCount = Math.round(txCount * multiplier)`; `uniqueToCount` untouched.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/oracle/loyalty.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/oracle/loyalty.test.ts`
Expected: FAIL — `Failed to resolve import "./loyalty"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/oracle/loyalty.ts`:

```ts
/**
 * loyalty.ts
 * Off-chain loyalty multiplier: players who entered prior rounds get a higher
 * per-day Score. Prior rosters are read on-chain via getRoundPlayers — two
 * reads total (rounds N-1 and N-2), independent of player count.
 */
import { type Address, type PublicClient, parseAbi } from "viem";
import type { QualifyingTx } from "./scanner";
import { LOYALTY } from "./scoreConfig";

const LOYALTY_ABI = parseAbi([
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
]);

export interface PriorParticipation {
  prev: Set<string>;
  prev2: Set<string>;
}

export async function getPriorParticipants(
  client: PublicClient,
  vaultAddress: Address,
  roundId: bigint
): Promise<PriorParticipation> {
  const readPlayers = async (rid: bigint): Promise<Set<string>> => {
    if (rid < 1n) return new Set();
    try {
      const players = (await client.readContract({
        address: vaultAddress,
        abi: LOYALTY_ABI,
        functionName: "getRoundPlayers",
        args: [rid],
      })) as Address[];
      return new Set(players.map((p) => p.toLowerCase()));
    } catch {
      return new Set();
    }
  };

  const [prev, prev2] = await Promise.all([
    readPlayers(roundId - 1n),
    readPlayers(roundId - 2n),
  ]);
  return { prev, prev2 };
}

export function loyaltyMultiplierFor(
  player: Address,
  parts: PriorParticipation
): number {
  const p = player.toLowerCase();
  if (parts.prev.has(p) && parts.prev2.has(p)) return LOYALTY.ENTERED_TWO_PLUS;
  if (parts.prev.has(p)) return LOYALTY.ENTERED_LAST;
  return LOYALTY.NONE;
}

export function applyLoyalty(
  qualifying: QualifyingTx[],
  multiplierFor: (player: Address) => number
): QualifyingTx[] {
  return qualifying.map((q) => {
    const mult = multiplierFor(q.player);
    return mult === 1 ? q : { ...q, txCount: Math.round(q.txCount * mult) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/oracle/loyalty.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/loyalty.ts frontend/lib/oracle/loyalty.test.ts
git commit -m "feat(oracle): loyalty multiplier from prior-round participation"
```

---

### Task 4: End-of-day submission — only scan closed days

**Files:**
- Modify: `frontend/lib/oracle/scanner.ts` (`getRoundDayWindows` ~lines 68-87; `scanAllPlayers` ~line 326)
- Test: `frontend/lib/oracle/scanner.test.ts` (add closedOnly tests)

**Interfaces:**
- Produces: `getRoundDayWindows(roundStartTime: bigint, opts?: { closedOnly?: boolean }): Array<{ dayIndex; start; end }>`. Default `closedOnly: false` preserves existing behavior (all elapsed days through today). With `closedOnly: true`, the in-progress day (`end >= now`) is excluded. `scanAllPlayers` now requests `closedOnly: true`.

- [ ] **Step 1: Add failing closedOnly tests**

In `frontend/lib/oracle/scanner.test.ts`, add these inside `describe("getRoundDayWindows", ...)`:

```ts
  it("closedOnly excludes the in-progress day", () => {
    // NOW is Thu 12:00Z; Thu (day 3) has not closed yet.
    const windows = getRoundDayWindows(ROUND_START, { closedOnly: true });
    expect(windows.map((w) => w.dayIndex)).toEqual([0, 1, 2]);
  });

  it("closedOnly returns no windows on the first day before it closes", () => {
    // Round started today at 00:00Z; day 0 ends 23:59:59Z, still in progress.
    const todayStart = BigInt(Math.floor(Date.UTC(2026, 0, 8, 0, 0, 0) / 1000));
    expect(getRoundDayWindows(todayStart, { closedOnly: true })).toEqual([]);
  });

  it("closedOnly still includes every fully-elapsed day", () => {
    const windows = getRoundDayWindows(ROUND_START, { closedOnly: true });
    for (const w of windows) expect(w.end).toBeLessThan(Math.floor(NOW_MS / 1000));
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/oracle/scanner.test.ts -t closedOnly`
Expected: FAIL — `getRoundDayWindows` ignores the 2nd argument, so it returns `[0,1,2,3]`.

- [ ] **Step 3: Implement the option**

In `frontend/lib/oracle/scanner.ts`, replace the `getRoundDayWindows` signature and body (lines ~68-87) with:

```ts
export function getRoundDayWindows(
  roundStartTime: bigint,
  opts: { closedOnly?: boolean } = {}
): Array<{
  dayIndex: number;
  start: number;
  end: number;
}> {
  const base = effectiveRoundStart(roundStartTime);
  const now = Math.floor(Date.now() / 1000);

  // Which day of the round are we currently in (0-based). Negative if the
  // round hasn't started yet.
  const currentDayIndex = Math.floor((now - base) / DAY);

  const windows: Array<{ dayIndex: number; start: number; end: number }> = [];
  for (let dayIndex = 0; dayIndex <= Math.min(currentDayIndex, 6); dayIndex++) {
    const start = base + dayIndex * DAY;
    const end = start + DAY - 1;
    // Submit a day's Score only after it closes, so the full day is rate-capped
    // before the on-chain once-only guard locks it in. The live "Today's in"
    // feel is handled client-side (optimistic UI).
    if (opts.closedOnly && end >= now) continue;
    windows.push({ dayIndex, start, end });
  }

  return windows;
}
```

- [ ] **Step 4: Make `scanAllPlayers` request closed days only**

In `frontend/lib/oracle/scanner.ts`, change the first line of `scanAllPlayers` (currently ~line 326):

```ts
  const dayWindows = getRoundDayWindows(roundInfo.startTime);
```

to:

```ts
  const dayWindows = getRoundDayWindows(roundInfo.startTime, { closedOnly: true });
```

- [ ] **Step 5: Run the full scanner suite**

Run: `npx vitest run lib/oracle/scanner.test.ts`
Expected: PASS. Existing `getRoundDayWindows` tests use the default (all days) and are unchanged. The `scanAllPlayers` integration tests still pass: at NOW=Thu noon, day 0 (Mon) is closed and carries the stubbed tx, so the single-day assertions hold.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/scanner.ts frontend/lib/oracle/scanner.test.ts
git commit -m "feat(oracle): submit streaks only after a day closes (end-of-day)"
```

---

### Task 5: Wire loyalty into the oracle run

**Files:**
- Modify: `frontend/lib/oracle/run.ts`
- Test: `frontend/lib/oracle/run.test.ts` (new)

**Interfaces:**
- Consumes: `scanAllPlayers`, `getCurrentRound` (scanner); `checkAlreadySubmitted`, `batchSubmitStreaks` (submitter); `getPriorParticipants`, `loyaltyMultiplierFor`, `applyLoyalty` (loyalty).
- Produces: unchanged `runOracleScan(publicClient, walletClient, opts)` signature and `OracleRunResult`; qualifying streaks now have loyalty applied before the already-submitted check and submission.

- [ ] **Step 1: Write the failing wiring test**

Create `frontend/lib/oracle/run.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/run.test.ts`
Expected: FAIL — `applyLoyalty`/`getPriorParticipants` are never called (run.ts doesn't import loyalty yet), so `checkAlreadySubmitted` is asserted with `scanned`, not `boosted`.

- [ ] **Step 3: Wire loyalty into `runOracleScan`**

In `frontend/lib/oracle/run.ts`, update the imports (lines ~13-14):

```ts
import { getCurrentRound, scanAllPlayers } from "./scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "./submitter";
import { getPriorParticipants, loyaltyMultiplierFor, applyLoyalty } from "./loyalty";
```

Then, replace the block that computes `qualifying` and the early-return (currently ~lines 47-54):

```ts
  console.log("Oracle: scanning players...");
  const qualifying = await scanAllPlayers(roundInfo, apiKey);
  const noActivity = roundInfo.players.length - qualifying.length;
  console.log(
    `Oracle: ${qualifying.length} qualifying out of ${roundInfo.players.length}`
  );

  if (qualifying.length === 0) return { ...base, noActivity };
```

with:

```ts
  console.log("Oracle: scanning players...");
  const scanned = await scanAllPlayers(roundInfo, apiKey);
  const noActivity = roundInfo.players.length - scanned.length;
  console.log(
    `Oracle: ${scanned.length} qualifying out of ${roundInfo.players.length}`
  );

  if (scanned.length === 0) return { ...base, noActivity };

  // Apply the loyalty multiplier (returning players score higher). Prior rosters
  // are read on-chain once per run, independent of player count.
  const parts = await getPriorParticipants(
    publicClient,
    vaultAddress,
    roundInfo.roundId
  );
  const qualifying = applyLoyalty(scanned, (player) =>
    loyaltyMultiplierFor(player, parts)
  );
```

(The remaining lines — `checkAlreadySubmitted(publicClient, oracleAddress, qualifying)` onward — already use `qualifying` and need no change.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/run.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole oracle folder + type-check**

Run: `npx vitest run lib/oracle/ && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/run.ts frontend/lib/oracle/run.test.ts
git commit -m "feat(oracle): apply loyalty multiplier in the run pipeline"
```

---

### Task 6: Optimistic "Today's in" (client-side)

**Files:**
- Create: `frontend/lib/todayActivity.ts` (pure helper)
- Create: `frontend/lib/todayActivity.test.ts`
- Create: `frontend/hooks/useTodayActivity.ts`
- Modify: `frontend/components/StreakCard.tsx`
- Modify: `frontend/components/StreakCard.test.tsx`
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `effectiveRoundStart`, `DAY` from `@/lib/roundDay`.
- Produces:
  - `hasOutgoingToday(txs: Array<{ to: string | null; timestamp: number }>, todayStart: number, player: string): boolean` — true if any tx in `[todayStart, todayStart+DAY)` is outgoing to a non-self recipient.
  - `useTodayActivity(address?: string, round?: { startTime: bigint }): { hasActivityToday: boolean; isLoading: boolean }`.
  - `StreakCard` gains an optional `optimistic?: boolean` prop; when `todayDone && optimistic` it renders "Today's in · confirming".

- [ ] **Step 1: Write the failing helper test**

Create `frontend/lib/todayActivity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasOutgoingToday } from "./todayActivity";
import { DAY } from "./roundDay";

const player = "0x1111111111111111111111111111111111111111";
const start = 1_000_000;

describe("hasOutgoingToday", () => {
  it("is true for an outgoing tx to another address today", () => {
    const txs = [{ to: "0xABC0000000000000000000000000000000000000", timestamp: start + 5 }];
    expect(hasOutgoingToday(txs, start, player)).toBe(true);
  });

  it("ignores self-sends", () => {
    const txs = [{ to: player, timestamp: start + 5 }];
    expect(hasOutgoingToday(txs, start, player)).toBe(false);
  });

  it("ignores null recipients", () => {
    expect(hasOutgoingToday([{ to: null, timestamp: start + 5 }], start, player)).toBe(false);
  });

  it("ignores txs outside today's window", () => {
    const txs = [
      { to: "0xABC0000000000000000000000000000000000000", timestamp: start - 5 },
      { to: "0xABC0000000000000000000000000000000000000", timestamp: start + DAY + 5 },
    ];
    expect(hasOutgoingToday(txs, start, player)).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasOutgoingToday([], start, player)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/todayActivity.test.ts`
Expected: FAIL — `Failed to resolve import "./todayActivity"`.

- [ ] **Step 3: Write the pure helper**

Create `frontend/lib/todayActivity.ts`:

```ts
/**
 * todayActivity.ts
 * Client-side check: has the connected player made a qualifying outgoing tx in
 * today's round-day window? Drives the optimistic "Today's in" state so the UI
 * feels live even though the oracle finalizes a day's streak only after it
 * closes.
 */
import { DAY } from "./roundDay";

export function hasOutgoingToday(
  txs: Array<{ to: string | null; timestamp: number }>,
  todayStart: number,
  player: string
): boolean {
  const p = player.toLowerCase();
  const end = todayStart + DAY;
  return txs.some(
    (tx) =>
      tx.timestamp >= todayStart &&
      tx.timestamp < end &&
      tx.to != null &&
      tx.to.toLowerCase() !== p
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/todayActivity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the hook (thin network wrapper)**

Create `frontend/hooks/useTodayActivity.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { effectiveRoundStart, DAY } from "@/lib/roundDay";
import { hasOutgoingToday } from "@/lib/todayActivity";

const BLOCKSCOUT_API = "https://celo.blockscout.com/api/v2";

/**
 * True once the connected player has an outgoing tx in today's round-day window.
 * One Blockscout call for the connected address only — cheap, and refreshed on a
 * short interval so "Today's in" flips within ~a minute of the player's tx.
 */
export function useTodayActivity(
  address?: string,
  round?: { startTime: bigint }
): { hasActivityToday: boolean; isLoading: boolean } {
  const base = round ? effectiveRoundStart(round.startTime) : 0;
  const now = Math.floor(Date.now() / 1000);
  const dayIndex = round ? Math.floor((now - base) / DAY) : -1;
  const todayStart = base + Math.max(dayIndex, 0) * DAY;

  const enabled = !!address && !!round && dayIndex >= 0 && dayIndex <= 6;

  const { data, isLoading } = useQuery({
    queryKey: ["todayActivity", address, todayStart],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const url = `${BLOCKSCOUT_API}/addresses/${address}/transactions?filter=from`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return false;
      const json: {
        items?: Array<{ timestamp: string; to?: { hash: string } | null }>;
      } = await res.json();
      const txs = (json.items ?? []).map((i) => ({
        to: i.to?.hash ?? null,
        timestamp: Math.floor(new Date(i.timestamp).getTime() / 1000),
      }));
      return hasOutgoingToday(txs, todayStart, address as string);
    },
  });

  return { hasActivityToday: data === true, isLoading };
}
```

- [ ] **Step 6: Add the failing StreakCard optimistic test**

In `frontend/components/StreakCard.test.tsx`, add:

```tsx
  it("shows a 'confirming' state when today is optimistic-only", () => {
    render(<StreakCard streak={3} todayDone optimistic />);
    expect(screen.getByText(/confirming/i)).toBeInTheDocument();
  });
```

(If `StreakCard.test.tsx` lacks imports, ensure it has `import { render, screen } from "@testing-library/react";` and `import StreakCard from "./StreakCard";`.)

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run components/StreakCard.test.tsx -t confirming`
Expected: FAIL — no "confirming" text; `optimistic` prop not supported.

- [ ] **Step 8: Add the `optimistic` prop to StreakCard**

In `frontend/components/StreakCard.tsx`, update the props interface and the "Today's in" pill. Replace the interface:

```tsx
interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  isLoading?: boolean;
}
```

with:

```tsx
interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  optimistic?: boolean;
  isLoading?: boolean;
}
```

Update the destructure `({ streak, todayDone, isLoading })` to `({ streak, todayDone, optimistic, isLoading })`, and replace the `todayDone ?` pill (lines ~33-37) with:

```tsx
          {todayDone ? (
            <span className="pill-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              {optimistic ? "Today’s in · confirming" : "Today’s in"}
            </span>
          ) : (
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run components/StreakCard.test.tsx`
Expected: PASS.

- [ ] **Step 10: Wire the hook into the home page**

In `frontend/app/page.tsx`, add the import:

```tsx
import { useTodayActivity } from "@/hooks/useTodayActivity";
```

After the `todayDone` derivation (currently ~lines 40-43), add:

```tsx
  const { hasActivityToday } = useTodayActivity(address, round);
  const optimisticToday = hasActivityToday && !todayDone;
```

Then update the `StreakCard` usage (currently ~lines 114-120) to pass the combined state:

```tsx
      {isConnected && stats?.entered && (
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayDone || hasActivityToday}
          optimistic={optimisticToday}
          isLoading={statsLoading}
        />
      )}
```

- [ ] **Step 11: Type-check and run the full suite**

Run: `npm run type-check && npm test`
Expected: PASS, no type errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/lib/todayActivity.ts frontend/lib/todayActivity.test.ts frontend/hooks/useTodayActivity.ts frontend/components/StreakCard.tsx frontend/components/StreakCard.test.tsx frontend/app/page.tsx
git commit -m "feat(ui): optimistic 'Today's in' while streak finalizes at day-close"
```

> **Manual verification (network hook):** run `npm run dev`, connect a wallet that entered the round, send an outgoing tx on Celo, and confirm the streak card flips to "Today’s in · confirming" within ~a minute (before the day closes / oracle submits).

---

### Task 7: Relabel `txCount` → "Score" in the UI

**Files:**
- Modify: `frontend/components/Leaderboard.tsx` (line ~82-84)
- Modify: `frontend/components/Leaderboard.test.tsx` (add a label assertion)
- Modify: `frontend/app/page.tsx` ("How to play" copy, line ~194)

**Interfaces:**
- No new exports. `LeaderboardEntry.txCount` stays the data field; only display text changes.

- [ ] **Step 1: Add the failing label test**

In `frontend/components/Leaderboard.test.tsx`, add:

```tsx
  it("labels the activity value as Score points, not raw tx", () => {
    render(<Leaderboard entries={[entry({ txCount: 12 })]} showPrizes={false} />);
    expect(screen.getByText("12 pts")).toBeInTheDocument();
    expect(screen.queryByText("12 tx")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/Leaderboard.test.tsx -t "Score points"`
Expected: FAIL — the row currently renders "12 tx".

- [ ] **Step 3: Relabel in the Leaderboard**

In `frontend/components/Leaderboard.tsx`, replace the sublabel (currently ~lines 82-84):

```tsx
              <p className="text-[10px] uppercase tracking-cap text-ink-mute mt-1">
                {entry.txCount} tx
              </p>
```

with:

```tsx
              <p
                className="text-[10px] uppercase tracking-cap text-ink-mute mt-1"
                title="rate-capped activity — spamming doesn't help"
              >
                {entry.txCount} pts
              </p>
```

- [ ] **Step 4: Update the "How to play" ranking copy**

In `frontend/app/page.tsx`, replace the ranking line in the "How to play" list (currently ~line 194):

```tsx
              <>Ranking: longest streak, then tx count, then unique addresses.</>,
```

with:

```tsx
              <>Ranking: longest streak, then <strong>Score</strong> (rate-capped activity — spamming doesn’t help), then unique addresses.</>,
```

- [ ] **Step 5: Run the component suite + type-check**

Run: `npx vitest run components/Leaderboard.test.tsx && npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/Leaderboard.tsx frontend/components/Leaderboard.test.tsx frontend/app/page.tsx
git commit -m "feat(ui): relabel txCount as Score (rate-capped activity)"
```

---

## Final verification

- [ ] Run the whole frontend suite: `cd frontend && npm test` → all pass.
- [ ] Type-check: `npm run type-check` → no errors.
- [ ] Lint: `npm run lint` → clean.
- [ ] Manual: `npm run dev`, confirm (a) leaderboard shows "N pts", (b) "How to play" mentions Score, (c) optimistic "Today’s in · confirming" appears after a live tx.

## Spec coverage check (self-review)

- **Rate cap / anti-farm (#3):** Tasks 1-2. ✓
- **uniqueTo over rate-capped set:** Task 2. ✓
- **Loyalty multiplier (#4):** Tasks 3, 5. ✓
- **End-of-day submission:** Task 4. ✓
- **Optimistic UI:** Task 6. ✓
- **Relabel txCount → Score:** Task 7. ✓
- **No contract change:** entire plan is `frontend/`-only. ✓
- **Out of scope (later phases):** XP/levels/streak-freeze (Phase 2), onboarding carousel (Phase 3) — intentionally excluded.

## Notes for the implementer

- Loyalty multiplies **`txCount` only**; `uniqueToCount` is never scaled (it stays a genuine recipient count). `Math.round` is used for the multiplied value.
- The end-of-day change means the on-chain streak for "today" appears only after ~UTC midnight; the optimistic hook (Task 6) is what keeps the card live in the meantime. Do not skip Task 6 — without it the card would read "Pending today" all day even after the player transacts.
- `getRoundDayWindows`' new `closedOnly` option defaults to `false`, so the existing UI/`roundDay` callers and their tests are unaffected; only `scanAllPlayers` opts in.
- The resolve route calls the same `runOracleScan`; by the time a round resolves (just after `endTime`), day 6 has closed, so the final scan submits it before resolving. No separate change needed there.
