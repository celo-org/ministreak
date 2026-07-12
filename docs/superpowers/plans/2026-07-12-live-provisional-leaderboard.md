# Live Provisional Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live leaderboard standings — today's provisional score folded in and re-ranked — while keeping on-chain submission at day-close unchanged, backed by a Vercel KV snapshot the oracle cron writes each run.

**Architecture:** The oracle cron does ONE all-players scan (`closedOnly:false`), submits closed days on-chain as before, and writes the open day's provisional scores to Vercel KV. A public API route serves the snapshot. `useLeaderboard` merges on-chain confirmed + provisional today (additive Score/uniqueTo, provisional streak), re-ranks, and shows a LIVE badge. Degrades to the plain on-chain leaderboard if provisional is absent.

**Tech Stack:** Next.js 14 App Router, TypeScript, viem, wagmi + @tanstack/react-query (^5), `@vercel/kv`, Vitest.

## Global Constraints

- **No contract change.** On-chain submission timing (day-close), ranking keys (`streak → txCount → uniqueToCount`), and payout are untouched. Provisional is **display-only**.
- **Additive, never rewrites on-chain.** `displayScore = onChainScore + todayScore`; `displayUniqueTo = onChainUniqueTo + todayUniqueTo`; `displayStreak = provisional.streak ?? onChainStreak`.
- **Single scan per run.** The cron performs ONE `scanAllPlayers(..., {closedOnly:false})`; it must NOT run a second full scan for provisional. Closed days (`dayIndex < currentDayIndex`) go to the submit path; the open day (`dayIndex === currentDayIndex`) feeds provisional.
- **KV failures are non-fatal.** A failed provisional write/read must never break submission or the leaderboard — wrap in try/catch and degrade to on-chain.
- **Re-rank order** after merge is `streak DESC → Score(txCount) DESC → uniqueToCount DESC` (the contract's order).
- **KV key:** `provisional:<roundId>`, TTL 3h.
- **All commands run from `frontend/`.** Test: `npm test` / `npx vitest run <path>`. Commit per task. TDD, DRY, YAGNI.

---

### Task 1: `scanAllPlayers` gains a `closedOnly` option

**Files:**
- Modify: `frontend/lib/oracle/scanner.ts` (`scanAllPlayers`, ~lines 336-357)
- Test: `frontend/lib/oracle/scanner.test.ts`

**Interfaces:**
- Produces: `scanAllPlayers(roundInfo, apiKey, opts?: { closedOnly?: boolean }): Promise<QualifyingTx[]>`. Default `closedOnly: true` (unchanged behavior). With `closedOnly:false`, all day windows including the open day are scanned (so the open day's txs are returned too).

- [ ] **Step 1: Add a failing test**

In `frontend/lib/oracle/scanner.test.ts`, add inside `describe("scanAllPlayers (integration over mocked Blockscout fetch)", ...)`:

```ts
  it("with closedOnly:false, includes the in-progress day", async () => {
    // NOW is Thu 12:00Z; Thu (day 3) is in progress. A tx today (day 3) must appear.
    const day3 = Number(ROUND_START) + 3 * DAY + 100;
    stubFetchOnce([{ to: "0xAAAA000000000000000000000000000000000000", ts: day3 }]);
    const result = await scanAllPlayers(roundInfo, "fake-key", { closedOnly: false });
    expect(result.map((r) => r.dayIndex)).toContain(3);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/scanner.test.ts -t "closedOnly:false"`
Expected: FAIL — `scanAllPlayers` ignores the 3rd arg and uses hardcoded `closedOnly:true`, so day 3 is excluded.

- [ ] **Step 3: Implement the option**

In `frontend/lib/oracle/scanner.ts`, replace the `scanAllPlayers` signature and the first line of its body (currently ~lines 336-340):

```ts
export async function scanAllPlayers(
  roundInfo: RoundInfo,
  apiKey: string
): Promise<QualifyingTx[]> {
  const dayWindows = getRoundDayWindows(roundInfo.startTime, { closedOnly: true });
```

with:

```ts
export async function scanAllPlayers(
  roundInfo: RoundInfo,
  apiKey: string,
  opts: { closedOnly?: boolean } = {}
): Promise<QualifyingTx[]> {
  const { closedOnly = true } = opts;
  const dayWindows = getRoundDayWindows(roundInfo.startTime, { closedOnly });
```

- [ ] **Step 4: Run the full scanner suite**

Run: `npx vitest run lib/oracle/scanner.test.ts`
Expected: PASS. The default is still `closedOnly:true`, so existing callers/tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/scanner.ts frontend/lib/oracle/scanner.test.ts
git commit -m "feat(oracle): scanAllPlayers closedOnly option (all-days scan)"
```

---

### Task 2: `computeProvisional` (pure)

**Files:**
- Create: `frontend/lib/oracle/provisional.ts`
- Test: `frontend/lib/oracle/provisional.test.ts`

**Interfaces:**
- Consumes: `QualifyingTx`, `RoundInfo` types from `./scanner`.
- Produces: types `ProvisionalPlayer`, `ProvisionalSnapshot`, and
  `computeProvisional(allDayEntries: QualifyingTx[], openDayIndex: number, roundInfo: RoundInfo): ProvisionalSnapshot`.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/oracle/provisional.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeProvisional } from "./provisional";
import type { QualifyingTx, RoundInfo } from "./scanner";

const A = "0xAAAA000000000000000000000000000000000000" as const;
const B = "0xBBBB000000000000000000000000000000000000" as const;
const roundInfo = { roundId: 7n } as RoundInfo;

const entry = (player: string, dayIndex: number, txCount = 1, uniqueToCount = 1): QualifyingTx =>
  ({ player: player as `0x${string}`, roundId: 7n, dayIndex, txCount, uniqueToCount });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 8, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe("computeProvisional", () => {
  it("sets today's score/uniqueTo and active from the open-day entry", () => {
    const snap = computeProvisional([entry(A, 0), entry(A, 1, 3, 2)], 1, roundInfo);
    expect(snap.players[A.toLowerCase()]).toMatchObject({
      todayScore: 3,
      todayUniqueTo: 2,
      active: true,
    });
  });

  it("computes streak as the consecutive run ending at the most recent active day", () => {
    // active days 0,1,2 (open day = 2) -> streak 3
    const snap = computeProvisional([entry(A, 0), entry(A, 1), entry(A, 2)], 2, roundInfo);
    expect(snap.players[A.toLowerCase()].streak).toBe(3);
  });

  it("resets streak after a gap", () => {
    // active days 0,1,3 (missed day 2), open day = 3 -> streak 1
    const snap = computeProvisional([entry(A, 0), entry(A, 1), entry(A, 3)], 3, roundInfo);
    expect(snap.players[A.toLowerCase()].streak).toBe(1);
  });

  it("marks a player inactive today when they have no open-day entry", () => {
    // active only on closed day 0; open day = 1
    const snap = computeProvisional([entry(A, 0)], 1, roundInfo);
    expect(snap.players[A.toLowerCase()]).toMatchObject({
      active: false,
      todayScore: 0,
      todayUniqueTo: 0,
      streak: 1, // run ends at day 0
    });
  });

  it("carries roundId, dayIndex and updatedAt on the snapshot", () => {
    const snap = computeProvisional([entry(A, 0)], 0, roundInfo);
    expect(snap.roundId).toBe("7");
    expect(snap.dayIndex).toBe(0);
    expect(snap.updatedAt).toBe(Math.floor(Date.UTC(2026, 0, 8, 12, 0, 0) / 1000));
  });

  it("keys players by lowercased address and includes every player with an entry", () => {
    const snap = computeProvisional([entry(A, 0), entry(B, 0)], 0, roundInfo);
    expect(Object.keys(snap.players).sort()).toEqual([A.toLowerCase(), B.toLowerCase()].sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/provisional.test.ts`
Expected: FAIL — `Failed to resolve import "./provisional"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/oracle/provisional.ts`:

```ts
/**
 * provisional.ts
 * Pure computation of the "today" provisional leaderboard snapshot from the
 * oracle's all-days scan. Display-only: additive to on-chain confirmed values,
 * never a rewrite. KV I/O lives in provisionalStore.ts.
 */
import type { QualifyingTx, RoundInfo } from "./scanner";

export interface ProvisionalPlayer {
  streak: number; // provisional streak through today
  todayScore: number; // today's counted, loyalty-applied points (additive to on-chain)
  todayUniqueTo: number; // today's counted unique recipients (additive)
  active: boolean; // has a qualifying tx today
}

export interface ProvisionalSnapshot {
  roundId: string;
  dayIndex: number; // the open day index
  updatedAt: number; // unix seconds
  players: Record<string, ProvisionalPlayer>; // key = lowercased address
}

export function computeProvisional(
  allDayEntries: QualifyingTx[],
  openDayIndex: number,
  roundInfo: RoundInfo
): ProvisionalSnapshot {
  const byPlayer = new Map<string, QualifyingTx[]>();
  for (const e of allDayEntries) {
    const key = e.player.toLowerCase();
    const list = byPlayer.get(key);
    if (list) list.push(e);
    else byPlayer.set(key, [e]);
  }

  const players: Record<string, ProvisionalPlayer> = {};
  for (const [addr, entries] of byPlayer) {
    const days = new Set(entries.map((e) => e.dayIndex));
    // Provisional streak = consecutive run of active days ending at the most
    // recent active day (the open day if active today, else the last active
    // closed day). Handles the "missed a day -> reset" case.
    const maxDay = Math.max(...days);
    let streak = 0;
    for (let d = maxDay; d >= 0 && days.has(d); d--) streak++;

    const openEntry = entries.find((e) => e.dayIndex === openDayIndex);
    players[addr] = {
      streak,
      todayScore: openEntry?.txCount ?? 0,
      todayUniqueTo: openEntry?.uniqueToCount ?? 0,
      active: openEntry !== undefined,
    };
  }

  return {
    roundId: roundInfo.roundId.toString(),
    dayIndex: openDayIndex,
    updatedAt: Math.floor(Date.now() / 1000),
    players,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/provisional.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/provisional.ts frontend/lib/oracle/provisional.test.ts
git commit -m "feat(oracle): computeProvisional — pure today-snapshot from scan"
```

---

### Task 3: KV store (`provisionalStore.ts`) + `@vercel/kv`

**Files:**
- Modify: `frontend/package.json` (add `@vercel/kv`)
- Create: `frontend/lib/oracle/provisionalStore.ts`
- Test: `frontend/lib/oracle/provisionalStore.test.ts`

**Interfaces:**
- Consumes: `ProvisionalSnapshot` from `./provisional`.
- Produces: `writeProvisional(snapshot: ProvisionalSnapshot): Promise<void>`; `readProvisional(roundId: string): Promise<ProvisionalSnapshot | null>` (returns null on miss or any error — never throws).

- [ ] **Step 1: Install `@vercel/kv`**

Run (from `frontend/`): `npm install @vercel/kv --legacy-peer-deps`
Expected: adds `@vercel/kv` to `dependencies`.

> **One-time infra setup (document, no code):** In the Vercel dashboard, create a KV (Redis) database and connect it to the project — Vercel injects `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars automatically. Locally these can be set in `frontend/.env.local` for manual testing. The feature degrades to the on-chain leaderboard when they are unset, so this is not required for the code to build or tests to pass.

- [ ] **Step 2: Write the failing test**

Create `frontend/lib/oracle/provisionalStore.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/oracle/provisionalStore.test.ts`
Expected: FAIL — `Failed to resolve import "./provisionalStore"`.

- [ ] **Step 4: Write the implementation**

Create `frontend/lib/oracle/provisionalStore.ts`:

```ts
/**
 * provisionalStore.ts
 * Vercel KV read/write for the provisional leaderboard snapshot. Reads never
 * throw (missing/failed -> null) so the UI degrades to the on-chain leaderboard.
 */
import { kv } from "@vercel/kv";
import type { ProvisionalSnapshot } from "./provisional";

const KEY = (roundId: string) => `provisional:${roundId}`;
const TTL_SECONDS = 3 * 3600;

export async function writeProvisional(snapshot: ProvisionalSnapshot): Promise<void> {
  await kv.set(KEY(snapshot.roundId), snapshot, { ex: TTL_SECONDS });
}

export async function readProvisional(
  roundId: string
): Promise<ProvisionalSnapshot | null> {
  try {
    const snap = await kv.get<ProvisionalSnapshot>(KEY(roundId));
    return snap ?? null;
  } catch (e) {
    console.warn(`readProvisional failed for ${roundId}:`, (e as Error).message);
    return null;
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run lib/oracle/provisionalStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/lib/oracle/provisionalStore.ts frontend/lib/oracle/provisionalStore.test.ts
git commit -m "feat(oracle): Vercel KV provisional store (read never throws)"
```

---

### Task 4: Wire provisional into the oracle run

**Files:**
- Modify: `frontend/lib/oracle/run.ts`
- Test: `frontend/lib/oracle/run.test.ts`

**Interfaces:**
- Consumes: `scanAllPlayers` (now with `closedOnly`), `computeProvisional`, `writeProvisional`, `roundDayIndex`.
- Produces: unchanged `runOracleScan` signature/`OracleRunResult`. Behavior: one all-days scan; closed days submitted (as before); open day written to KV (non-fatal).

- [ ] **Step 1: Add the failing partition/provisional test**

The existing `run.test.ts` (from the prior loyalty task) already imports `vi`, `it`, `expect`, `beforeEach`, and — from the mocked modules — `getCurrentRound`, `scanAllPlayers`, `checkAlreadySubmitted`, `batchSubmitStreaks`, `getPriorParticipants`, `applyLoyalty`, plus the consts `A`, `VAULT`, `ORACLE`. Reuse those; add only what's below.

Add this `vi.mock` alongside the existing `vi.mock` calls at the top of the file:

```ts
vi.mock("./provisionalStore", () => ({
  writeProvisional: vi.fn(),
}));
```

Add this one import beside the existing imports (do not duplicate any already present):

```ts
import { writeProvisional } from "./provisionalStore";
```

Then add the test:

```ts
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
  // provisional captured today's (day 2) score
  const snap = (writeProvisional as any).mock.calls[0][0];
  expect(snap.dayIndex).toBe(2);
  expect(snap.players[A.toLowerCase()]).toMatchObject({ todayScore: 5, active: true });

  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/run.test.ts -t "provisional"`
Expected: FAIL — run.ts doesn't call `scanAllPlayers` with `{closedOnly:false}`, doesn't partition, and never calls `writeProvisional`.

- [ ] **Step 3: Wire run.ts**

In `frontend/lib/oracle/run.ts`, update imports (lines ~13-16):

```ts
import type { Address, PublicClient, WalletClient } from "viem";
import { getCurrentRound, scanAllPlayers } from "./scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "./submitter";
import { getPriorParticipants, loyaltyMultiplierFor, applyLoyalty } from "./loyalty";
import { computeProvisional } from "./provisional";
import { writeProvisional } from "./provisionalStore";
import { roundDayIndex } from "@/lib/roundDay";
```

Then replace the scan + loyalty block (currently lines ~50-68) — from `console.log("Oracle: scanning players...");` through the `applyLoyalty(...)` assignment — with:

```ts
  console.log("Oracle: scanning players (all days)...");
  const scanned = await scanAllPlayers(roundInfo, apiKey, { closedOnly: false });
  const noActivity = roundInfo.players.length - scanned.length;
  console.log(
    `Oracle: ${scanned.length} qualifying entries out of ${roundInfo.players.length} players`
  );

  if (scanned.length === 0) return { ...base, noActivity };

  // Apply the loyalty multiplier (returning players score higher). Prior rosters
  // are read on-chain once per run, independent of player count.
  const parts = await getPriorParticipants(
    publicClient,
    vaultAddress,
    roundInfo.roundId
  );
  const allWithLoyalty = applyLoyalty(scanned, (player) =>
    loyaltyMultiplierFor(player, parts)
  );

  // Write today's provisional snapshot to KV (display-only, non-fatal). The open
  // day is the day currently in progress; everything before it has closed.
  const nowSec = Math.floor(Date.now() / 1000);
  const currentDayIndex = roundDayIndex(roundInfo.startTime, nowSec);
  if (currentDayIndex >= 0 && currentDayIndex <= 6) {
    try {
      const snapshot = computeProvisional(allWithLoyalty, currentDayIndex, roundInfo);
      await writeProvisional(snapshot);
      console.log(`Oracle: wrote provisional snapshot (day ${currentDayIndex}).`);
    } catch (e) {
      console.warn(`Oracle: provisional write failed: ${(e as Error).message}`);
    }
  }

  // Only CLOSED days are submitted on-chain (the once-only guard locks a day, so
  // we submit it after it closes and is fully rate-capped).
  const qualifying = allWithLoyalty.filter((q) => q.dayIndex < currentDayIndex);
  if (qualifying.length === 0) {
    return { ...base, noActivity };
  }
```

(The remaining lines from `console.log("Oracle: checking on-chain submission status...")` onward already operate on `qualifying` and are unchanged.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/run.test.ts`
Expected: PASS — the new partition/provisional test and the existing loyalty-wiring test both pass. (The existing test uses `startTime: 0n`, making `currentDayIndex` large: all days count as closed and provisional is skipped, so its assertions are unchanged.)

- [ ] **Step 5: Folder suite + type-check**

Run: `npx vitest run lib/oracle/ && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/run.ts frontend/lib/oracle/run.test.ts
git commit -m "feat(oracle): write today's provisional snapshot; submit closed days only"
```

---

### Task 5: `/api/provisional` route

**Files:**
- Create: `frontend/app/api/provisional/route.ts`
- Test: `frontend/app/api/provisional/route.test.ts`

**Interfaces:**
- Consumes: `readProvisional` from `@/lib/oracle/provisionalStore`.
- Produces: `GET /api/provisional?roundId=<id>` → `{ snapshot: ProvisionalSnapshot | null }`. Never throws to the client.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/api/provisional/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/oracle/provisionalStore", () => ({
  readProvisional: vi.fn(),
}));

import { GET } from "./route";
import { readProvisional } from "@/lib/oracle/provisionalStore";

function req(url: string) {
  return new Request(url) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/provisional", () => {
  it("returns the snapshot for a roundId", async () => {
    const snap = { roundId: "7", dayIndex: 1, updatedAt: 1, players: {} };
    (readProvisional as any).mockResolvedValue(snap);
    const res = await GET(req("http://x/api/provisional?roundId=7"));
    expect(await res.json()).toEqual({ snapshot: snap });
    expect(readProvisional).toHaveBeenCalledWith("7");
  });

  it("returns { snapshot: null } when absent", async () => {
    (readProvisional as any).mockResolvedValue(null);
    const res = await GET(req("http://x/api/provisional?roundId=9"));
    expect(await res.json()).toEqual({ snapshot: null });
  });

  it("returns { snapshot: null } with 400 when roundId is missing", async () => {
    const res = await GET(req("http://x/api/provisional"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ snapshot: null });
    expect(readProvisional).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/provisional/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the route**

Create `frontend/app/api/provisional/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { readProvisional } from "@/lib/oracle/provisionalStore";

// Public, read-only provisional leaderboard snapshot. Never cached.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) {
    return NextResponse.json({ snapshot: null }, { status: 400 });
  }
  const snapshot = await readProvisional(roundId);
  return NextResponse.json(
    { snapshot },
    { headers: { "cache-control": "no-store" } }
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/api/provisional/route.test.ts`
Expected: PASS (3 tests). (`NextRequest` accepts a standard `Request`; `req.nextUrl` is derived from the URL.)

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/provisional/route.ts frontend/app/api/provisional/route.test.ts
git commit -m "feat(api): /api/provisional route serving the KV snapshot"
```

---

### Task 6: Merge provisional into the leaderboard (pure fn + hook wiring)

**Files:**
- Create: `frontend/lib/leaderboardMerge.ts`
- Create: `frontend/lib/leaderboardMerge.test.ts`
- Modify: `frontend/hooks/useLeaderboard.ts`

**Interfaces:**
- Consumes: `LeaderboardEntry` (type) from `@/hooks/useLeaderboard`; `ProvisionalSnapshot` from `@/lib/oracle/provisional`.
- Produces: `mergeProvisional(entries: LeaderboardEntry[], snapshot: ProvisionalSnapshot | null, distributable: number): LeaderboardEntry[]` — additive Score/uniqueTo, provisional streak, re-sorted + re-ranked + re-prized; returns `entries` unchanged when `snapshot` is null. `useLeaderboard` returns an added `updatedAt?: number` (present only when provisional applied).

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/leaderboardMerge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeProvisional } from "./leaderboardMerge";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { ProvisionalSnapshot } from "@/lib/oracle/provisional";

const A = "0xAAAA000000000000000000000000000000000000";
const B = "0xBBBB000000000000000000000000000000000000";

const e = (over: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  rank: 0, address: A, streak: 0, txCount: 0, uniqueToCount: 0, estimatedPrize: "0.00", ...over,
});

const snap = (players: ProvisionalSnapshot["players"]): ProvisionalSnapshot =>
  ({ roundId: "7", dayIndex: 1, updatedAt: 5, players });

describe("mergeProvisional", () => {
  it("returns entries unchanged when snapshot is null", () => {
    const entries = [e({ address: A, streak: 2 })];
    expect(mergeProvisional(entries, null, 100)).toBe(entries);
  });

  it("adds today's score/uniqueTo and uses provisional streak", () => {
    const entries = [e({ address: A, streak: 1, txCount: 4, uniqueToCount: 2 })];
    const out = mergeProvisional(
      entries,
      snap({ [A.toLowerCase()]: { streak: 2, todayScore: 3, todayUniqueTo: 1, active: true } }),
      100
    );
    expect(out[0]).toMatchObject({ streak: 2, txCount: 7, uniqueToCount: 3 });
  });

  it("re-ranks after merge so an active player can climb", () => {
    // B leads on-chain; A is active today and overtakes on streak.
    const entries = [
      e({ address: B, streak: 1, txCount: 9 }),
      e({ address: A, streak: 1, txCount: 1 }),
    ];
    const out = mergeProvisional(
      entries,
      snap({ [A.toLowerCase()]: { streak: 2, todayScore: 1, todayUniqueTo: 0, active: true } }),
      100
    );
    expect(out.map((x) => x.address)).toEqual([A, B]);
    expect(out[0].rank).toBe(1);
    expect(out[0].estimatedPrize).toBe("50.00"); // distributable 100 * 0.5
  });

  it("leaves players absent from the snapshot on their on-chain values", () => {
    const entries = [e({ address: A, streak: 3, txCount: 5 })];
    const out = mergeProvisional(entries, snap({}), 100);
    expect(out[0]).toMatchObject({ streak: 3, txCount: 5, rank: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/leaderboardMerge.test.ts`
Expected: FAIL — `Failed to resolve import "./leaderboardMerge"`.

- [ ] **Step 3: Write the pure merge**

Create `frontend/lib/leaderboardMerge.ts`:

```ts
/**
 * leaderboardMerge.ts
 * Fold the provisional (today) snapshot into the on-chain leaderboard: additive
 * Score/uniqueTo, provisional streak, then re-sort/re-rank/re-prize by the
 * contract's order (streak -> Score -> uniqueTo). Display-only.
 */
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { ProvisionalSnapshot } from "@/lib/oracle/provisional";

function prizeFor(rank: number, distributable: number): string {
  if (rank === 1) return (distributable * 0.5).toFixed(2);
  if (rank === 2) return (distributable * 0.3).toFixed(2);
  if (rank === 3) return (distributable * 0.2).toFixed(2);
  return "0.00";
}

export function mergeProvisional(
  entries: LeaderboardEntry[],
  snapshot: ProvisionalSnapshot | null,
  distributable: number
): LeaderboardEntry[] {
  if (!snapshot) return entries;

  const merged = entries.map((entry) => {
    const p = snapshot.players[entry.address.toLowerCase()];
    if (!p) return entry;
    return {
      ...entry,
      streak: p.streak,
      txCount: entry.txCount + p.todayScore,
      uniqueToCount: entry.uniqueToCount + p.todayUniqueTo,
    };
  });

  merged.sort(
    (a, b) =>
      b.streak - a.streak ||
      b.txCount - a.txCount ||
      b.uniqueToCount - a.uniqueToCount
  );

  return merged.map((entry, i) => ({
    ...entry,
    rank: i + 1,
    estimatedPrize: prizeFor(i + 1, distributable),
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/leaderboardMerge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the hook**

In `frontend/hooks/useLeaderboard.ts`, add imports at the top (below the existing imports):

```ts
import { useQuery } from "@tanstack/react-query";
import { mergeProvisional } from "@/lib/leaderboardMerge";
import type { ProvisionalSnapshot } from "@/lib/oracle/provisional";
```

Add the provisional fetch inside `useLeaderboard`, after the existing `roundData` read:

```ts
  const { data: provisional } = useQuery({
    queryKey: ["provisional", roundId],
    enabled: !!roundId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ProvisionalSnapshot | null> => {
      const res = await fetch(`/api/provisional?roundId=${roundId}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as { snapshot: ProvisionalSnapshot | null };
      return json.snapshot;
    },
  });
```

Then, where the hook currently finishes building `entries` (after the existing `.map(...estimatedPrize...)` block, before `let roundInfo = undefined;`), fold provisional in. Replace the final `entries = addresses...` assignment's closing so that immediately after `entries` is built you add:

```ts
    // Merge today's provisional snapshot (display-only) and re-rank.
    entries = mergeProvisional(entries, provisional ?? null, distributable);
```

(`distributable` is already computed above in the same block. Keep the existing on-chain build; this line re-ranks it when provisional is present, and is a no-op when it is null.)

Finally, expose `updatedAt` from the return. Change the return object to:

```ts
  return {
    data: roundIdBigInt ? { entries, round: roundInfo } : null,
    isLoading,
    updatedAt: provisional?.updatedAt,
  };
```

- [ ] **Step 6: Type-check + full suite**

Run: `npm run type-check && npm test`
Expected: PASS, no type errors. (The hook's network path is exercised manually; the merge logic is covered by Step 1's pure tests.)

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/leaderboardMerge.ts frontend/lib/leaderboardMerge.test.ts frontend/hooks/useLeaderboard.ts
git commit -m "feat(leaderboard): merge provisional today-scores + re-rank"
```

---

### Task 7: LIVE badge on the leaderboard

**Files:**
- Modify: `frontend/components/Leaderboard.tsx`
- Modify: `frontend/components/Leaderboard.test.tsx`
- Modify: `frontend/app/page.tsx` (home leaderboard usage)
- Modify: `frontend/app/leaderboard/page.tsx` (full leaderboard usage)

**Interfaces:**
- Produces: `Leaderboard` gains optional `updatedAt?: number`. When present, a "LIVE · updated Xm ago" badge renders above the rows.

- [ ] **Step 1: Add the failing test**

In `frontend/components/Leaderboard.test.tsx`, add:

```ts
  it("shows a LIVE badge when updatedAt is provided", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Leaderboard entries={[entry({})]} updatedAt={now - 120} showPrizes={false} />);
    expect(screen.getByText(/LIVE/i)).toBeInTheDocument();
    expect(screen.getByText(/2m ago/i)).toBeInTheDocument();
  });

  it("shows no LIVE badge without updatedAt", () => {
    render(<Leaderboard entries={[entry({})]} showPrizes={false} />);
    expect(screen.queryByText(/LIVE/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/Leaderboard.test.tsx -t "LIVE"`
Expected: FAIL — `updatedAt` prop and badge don't exist.

- [ ] **Step 3: Add the badge to Leaderboard**

In `frontend/components/Leaderboard.tsx`, extend the props interface:

```ts
interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isLoading?: boolean;
  showPrizes?: boolean;
  maxRows?: number;
  highlightAddress?: string;
  updatedAt?: number; // unix seconds; when set, renders a LIVE badge
}
```

Add `updatedAt` to the destructure, and above the `return (` add a small helper:

```ts
  const liveLabel = (() => {
    if (updatedAt === undefined) return null;
    const mins = Math.max(0, Math.floor(Date.now() / 1000 - updatedAt) / 60);
    const rounded = Math.floor(mins);
    return rounded < 1 ? "just now" : `${rounded}m ago`;
  })();
```

Then wrap the returned card so the badge sits above it. Replace the opening of the non-empty return:

```tsx
  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="card !p-0 overflow-hidden">
```

with:

```tsx
  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="space-y-2">
      {liveLabel && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-cap text-forest">
          <span className="h-1.5 w-1.5 rounded-full bg-forest animate-pulse" />
          LIVE · updated {liveLabel}
        </div>
      )}
      <div className="card !p-0 overflow-hidden">
```

and add one extra closing `</div>` at the very end of the component's returned JSX (close the new wrapper). The final lines become:

```tsx
        );
      })}
      </div>
    </div>
  );
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/Leaderboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Pass `updatedAt` from the pages**

In `frontend/app/page.tsx`, the leaderboard hook result is destructured (currently `const { data: leaderboard, isLoading: lbLoading } = useLeaderboard(...)`). Add `updatedAt`:

```tsx
  const { data: leaderboard, isLoading: lbLoading, updatedAt: lbUpdatedAt } =
    useLeaderboard(round?.roundId?.toString());
```

and pass it to the `<Leaderboard .../>` in that file:

```tsx
        <Leaderboard
          entries={leaderboard?.entries ?? []}
          isLoading={lbLoading}
          showPrizes
          maxRows={5}
          highlightAddress={address}
          updatedAt={lbUpdatedAt}
        />
```

In `frontend/app/leaderboard/page.tsx`, do the same: destructure `updatedAt` from `useLeaderboard(...)` and pass `updatedAt={...}` to its `<Leaderboard .../>`. (Read the file first to match its exact variable names and Leaderboard usage.)

- [ ] **Step 6: Type-check + full suite**

Run: `npm run type-check && npm test`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/Leaderboard.tsx frontend/components/Leaderboard.test.tsx frontend/app/page.tsx frontend/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): LIVE 'updated Xm ago' badge for provisional data"
```

---

## Final verification

- [ ] Full suite: `cd frontend && npm test` → all pass.
- [ ] Type-check: `npm run type-check` → clean.
- [ ] Lint: `npm run lint` → clean.
- [ ] Manual (needs KV env vars set): run the oracle route once, confirm `provisional:<roundId>` is written; load the app and confirm the leaderboard shows a LIVE badge and an active-today player's streak/score reflects today before day-close. Without KV env vars, confirm the leaderboard still renders (falls back to on-chain, no badge).

## Spec coverage (self-review)

- Single all-days scan → Task 1 + Task 4. ✓
- Provisional compute (streak/today score, additive) → Task 2. ✓
- Vercel KV store, read-never-throws → Task 3. ✓
- Cron writes provisional, submits closed only, non-fatal → Task 4. ✓
- API route → Task 5. ✓
- UI merge + re-rank + fallback → Task 6. ✓
- LIVE badge → Task 7. ✓
- No contract change; on-chain submit/payout unchanged → whole plan is `frontend/`-only. ✓
- Degrade to on-chain when provisional absent → Task 3 (null), Task 6 (null passthrough), Task 5 (null). ✓

## Notes for the implementer

- **Do not run two full scans.** Task 4 must reuse the single `closedOnly:false` scan for both submit and provisional. A second `scanAllPlayers` call doubles explorer-API load and breaks the near-free property.
- **Never contradict on-chain.** The merge is additive on Score/uniqueTo; provisional streak is authoritative only for display. On-chain remains the payout source of truth.
- **KV is optional at runtime.** All failure paths (unset env, read/write error, missing key) degrade to the on-chain leaderboard. Never throw to the client.
- The existing run.test.ts loyalty test uses `startTime: 0n` → large `currentDayIndex` → provisional skipped, all days treated as closed; its assertions remain valid.
