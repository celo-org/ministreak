# Phase 2b — Streak-Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player miss one day without losing their streak — the oracle grants freeze tokens at level milestones (off-chain) and, when a player returns after a single-day gap, bridges the missed day by submitting a covered on-chain entry (`txCount:0`) through the existing batch path. No contract change.

**Architecture:** Two pure decision functions (`grantFreezes` in `lib/xp.ts`, `decideFreezeCover` in `lib/oracle/freeze.ts`) carry all the logic and are heavily unit-tested. `freeze.ts` also holds the on-chain read (`getLastValidDays`) and the thin orchestration (`applyFreezeCovers`). `run.ts` merges covered entries into the submission batch (sorted so a covered day precedes its return day) behind the `FREEZE_ENABLED` flag. Profiles (Phase 2a KV) gain freeze fields.

**Tech Stack:** Next.js 14, TypeScript, viem (multicall), `@vercel/kv`, Vitest.

## Global Constraints

- **No contract change; no new on-chain write path.** A freeze = a synthetic `{player, missedDay, txCount:0, uniqueToCount:0}` entry submitted via the existing `batchSubmitStreaks`. Adds zero Score; only preserves the streak.
- **Cover-on-return, scarce & precious:** cover only a **single** missed day, only when the player **returns** (active on `lastValidDay + 2`); ≤1 freeze per round; hold max `FREEZE_CAP = 2`; earn 1 token per 3 levels (L3/L6/L9…). Auto-apply.
- **Ordering is load-bearing:** the covered day must be submitted **before** the return day for that player, or the contract resets the streak. The submission batch is sorted by `(player, dayIndex)` ascending.
- **`FREEZE_ENABLED` flag, default ON:** enabled unless `process.env.FREEZE_ENABLED === "false"`. When off, the cover step is skipped (no covered-day writes); granting still runs.
- **Non-fatal / fail-safe:** KV or read errors in grant/cover must never break submission (try/catch); a profile read failure → skip that player's cover (never fabricate a cover).
- **Reuses Phase 2a KV profile.** Old profiles lack the new fields → normalize on read (default `freezeTokens:0, lastFreezeMilestone:0, freezeUsedRound:null`).
- **All commands run from `frontend/`.** Test: `npm test` / `npx vitest run <path>`. Commit per task. TDD, DRY, YAGNI.

---

### Task 1: Profile freeze fields + `grantFreezes` + wire into `awardXp`

**Files:**
- Modify: `frontend/lib/xp.ts` (add `grantFreezes`)
- Modify: `frontend/lib/xp.test.ts`
- Modify: `frontend/lib/oracle/scoreConfig.ts` (add `FREEZE_CAP`)
- Modify: `frontend/lib/oracle/profileStore.ts` (extend `Profile`, normalize reads, grant in `awardXp`)
- Modify: `frontend/lib/oracle/profileStore.test.ts`

**Interfaces:**
- Produces: `grantFreezes(freezeTokens: number, lastFreezeMilestone: number, level: number, cap: number): { freezeTokens: number; lastFreezeMilestone: number }`; `FREEZE_CAP` const; extended `Profile` (`freezeTokens`, `lastFreezeMilestone`, `freezeUsedRound`); `awardXp` now also grants freezes and preserves `freezeUsedRound`.

- [ ] **Step 1: Add the failing `grantFreezes` tests**

In `frontend/lib/xp.test.ts`, add:

```ts
import { grantFreezes } from "./xp";

describe("grantFreezes", () => {
  it("grants a token when a level-3 milestone is first reached", () => {
    expect(grantFreezes(0, 0, 3, 2)).toEqual({ freezeTokens: 1, lastFreezeMilestone: 3 });
  });
  it("grants nothing below the first milestone", () => {
    expect(grantFreezes(0, 0, 2, 2)).toEqual({ freezeTokens: 0, lastFreezeMilestone: 0 });
  });
  it("grants for each newly-crossed milestone", () => {
    expect(grantFreezes(0, 0, 6, 2)).toEqual({ freezeTokens: 2, lastFreezeMilestone: 6 });
  });
  it("caps held tokens and still advances the milestone (forfeit beyond cap)", () => {
    expect(grantFreezes(2, 6, 9, 2)).toEqual({ freezeTokens: 2, lastFreezeMilestone: 9 });
  });
  it("is idempotent once a milestone is recorded", () => {
    expect(grantFreezes(1, 3, 3, 2)).toEqual({ freezeTokens: 1, lastFreezeMilestone: 3 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/xp.test.ts -t grantFreezes`
Expected: FAIL — `grantFreezes` is not exported.

- [ ] **Step 3: Implement `grantFreezes`**

Append to `frontend/lib/xp.ts`:

```ts
/**
 * Grant freeze tokens for newly-crossed level milestones (every 3rd level),
 * capped. lastFreezeMilestone advances even when the cap forfeits a grant, so
 * this is idempotent.
 */
export function grantFreezes(
  freezeTokens: number,
  lastFreezeMilestone: number,
  level: number,
  cap: number
): { freezeTokens: number; lastFreezeMilestone: number } {
  const milestone = Math.floor(level / 3) * 3;
  if (milestone <= lastFreezeMilestone) {
    return { freezeTokens, lastFreezeMilestone };
  }
  const newTokens = (milestone - lastFreezeMilestone) / 3;
  const granted = Math.min(newTokens, Math.max(0, cap - freezeTokens));
  return { freezeTokens: freezeTokens + granted, lastFreezeMilestone: milestone };
}
```

- [ ] **Step 4: Add `FREEZE_CAP`**

In `frontend/lib/oracle/scoreConfig.ts`, append:

```ts
/** Max freeze tokens a player can hold (streak-freeze, Phase 2b). */
export const FREEZE_CAP = 2;
```

- [ ] **Step 5: Add the failing profileStore tests**

In `frontend/lib/oracle/profileStore.test.ts`, add (the existing `entry`, `A`, mocked kv, `readProfile`/`writeProfile`/`awardXp` are already imported):

```ts
describe("awardXp — freeze grants + profile shape", () => {
  it("normalizes an old profile (missing freeze fields) on read", async () => {
    await (await import("@vercel/kv")).kv.set(`profile:${A.toLowerCase()}`, { xp: 50, cursor: null });
    expect(await readProfile(A)).toEqual({
      xp: 50, cursor: null, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null,
    });
  });
  it("grants a freeze token when awarded XP pushes the player to level 3", async () => {
    // Seed near L3 (threshold 250). 249 xp + a day that crosses it.
    await writeProfile(A, { xp: 249, cursor: { round: 7, day: 0 }, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null });
    await awardXp([entry(A, 1)], 7); // day-1 streak run [0? not present] -> streak 1 -> +10 xp = 259 -> level 3
    const p = (await readProfile(A))!;
    expect(p.xp).toBe(259);
    expect(p.freezeTokens).toBe(1);
    expect(p.lastFreezeMilestone).toBe(3);
  });
  it("preserves freezeUsedRound across an award", async () => {
    await writeProfile(A, { xp: 0, cursor: null, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: 6 });
    await awardXp([entry(A, 0)], 7);
    expect((await readProfile(A))!.freezeUsedRound).toBe(6);
  });
});
```

- [ ] **Step 6: Run to verify the new tests fail**

Run: `npx vitest run lib/oracle/profileStore.test.ts -t freeze`
Expected: FAIL — `Profile` lacks the fields / reads aren't normalized / `awardXp` doesn't grant.

- [ ] **Step 7: Extend `profileStore.ts`**

In `frontend/lib/oracle/profileStore.ts`:

Replace the `Profile` interface:

```ts
export interface Profile {
  xp: number;
  cursor: { round: number; day: number } | null;
}
```

with:

```ts
export interface Profile {
  xp: number;
  cursor: { round: number; day: number } | null;
  freezeTokens: number;
  lastFreezeMilestone: number;
  freezeUsedRound: number | null;
}

function normalize(p: Partial<Profile>): Profile {
  return {
    xp: p.xp ?? 0,
    cursor: p.cursor ?? null,
    freezeTokens: p.freezeTokens ?? 0,
    lastFreezeMilestone: p.lastFreezeMilestone ?? 0,
    freezeUsedRound: p.freezeUsedRound ?? null,
  };
}
```

Update the two reads to normalize. In `readProfile`, change `return p ?? null;` to:

```ts
    return p ? normalize(p) : null;
```

In `readProfileStrict`, change `return p ?? null;` to:

```ts
  return p ? normalize(p) : null;
```

Update the imports at the top to include the freeze helpers:

```ts
import { computeXpGrant, levelForXp, grantFreezes } from "@/lib/xp";
import { FREEZE_CAP } from "./scoreConfig";
```

Then in `awardXp`, replace the write block:

```ts
    const { awardedXp, newCursor } = computeXpGrant(days, round, profile.cursor);
    if (awardedXp > 0) {
      await writeProfile(address, { xp: profile.xp + awardedXp, cursor: newCursor });
    }
```

with:

```ts
    const { awardedXp, newCursor } = computeXpGrant(days, round, profile.cursor);
    if (awardedXp > 0) {
      const xp = profile.xp + awardedXp;
      const { freezeTokens, lastFreezeMilestone } = grantFreezes(
        profile.freezeTokens,
        profile.lastFreezeMilestone,
        levelForXp(xp),
        FREEZE_CAP
      );
      await writeProfile(address, {
        xp,
        cursor: newCursor,
        freezeTokens,
        lastFreezeMilestone,
        freezeUsedRound: profile.freezeUsedRound,
      });
    }
```

(The `?? { xp: 0, cursor: null }` default inside `awardXp` must become `?? { xp: 0, cursor: null, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null }` so the shape is complete — update that line.)

- [ ] **Step 8: Run the tests**

Run: `npx vitest run lib/xp.test.ts lib/oracle/profileStore.test.ts`
Expected: PASS (existing awardXp accumulation/idempotency tests still green — the new fields default to 0/null and don't affect XP math).

- [ ] **Step 9: Commit**

```bash
git add frontend/lib/xp.ts frontend/lib/xp.test.ts frontend/lib/oracle/scoreConfig.ts frontend/lib/oracle/profileStore.ts frontend/lib/oracle/profileStore.test.ts
git commit -m "feat(freeze): profile freeze fields + grant tokens at level milestones"
```

---

### Task 2: `decideFreezeCover` (pure) + `getLastValidDays` (read)

**Files:**
- Create: `frontend/lib/oracle/freeze.ts`
- Test: `frontend/lib/oracle/freeze.test.ts`

**Interfaces:**
- Produces:
  - `decideFreezeCover(args: { lastValidDay: number; activeClosedDays: number[]; freezeTokens: number; freezeUsedRound: number | null; currentRound: number }): number | null` — the day index to cover, or null.
  - `getLastValidDays(client: PublicClient, vaultAddress: Address, roundId: bigint, players: Address[]): Promise<Map<string, number>>` — lowercased address → on-chain `lastValidDay` (255 sentinel = none).

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/oracle/freeze.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { decideFreezeCover, getLastValidDays } from "./freeze";

const base = { freezeTokens: 1, freezeUsedRound: null as number | null, currentRound: 7 };

describe("decideFreezeCover", () => {
  it("covers the single missed day when the player returns after a 1-day gap", () => {
    // last recorded day 2, active again on day 4 -> missed day 3
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [4] })).toBe(3);
  });
  it("returns null with no token", () => {
    expect(decideFreezeCover({ ...base, freezeTokens: 0, lastValidDay: 2, activeClosedDays: [4] })).toBeNull();
  });
  it("returns null if a freeze was already used this round", () => {
    expect(decideFreezeCover({ ...base, freezeUsedRound: 7, lastValidDay: 2, activeClosedDays: [4] })).toBeNull();
  });
  it("returns null when the player has not returned yet", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [] })).toBeNull();
  });
  it("returns null on a consecutive day (no gap)", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [3] })).toBeNull();
  });
  it("returns null on a 2+ day gap (no consecutive cover)", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [5] })).toBeNull();
  });
  it("returns null on the 255 sentinel (no recorded day)", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 255, activeClosedDays: [2] })).toBeNull();
  });
  it("uses the earliest return day", () => {
    expect(decideFreezeCover({ ...base, lastValidDay: 2, activeClosedDays: [6, 4] })).toBe(3);
  });
});

describe("getLastValidDays", () => {
  it("maps each player to their lastValidDay via multicall", async () => {
    const A = "0xAAAA000000000000000000000000000000000000" as const;
    const B = "0xBBBB000000000000000000000000000000000000" as const;
    const client = {
      multicall: vi.fn(async () => [
        { status: "success", result: [3, 5, 2, 4, false, true] }, // A: lastValidDay 4
        { status: "success", result: [0, 0, 0, 255, false, true] }, // B: none
      ]),
    } as any;
    const map = await getLastValidDays(client, "0xvault" as any, 7n, [A, B]);
    expect(map.get(A.toLowerCase())).toBe(4);
    expect(map.get(B.toLowerCase())).toBe(255);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/freeze.test.ts`
Expected: FAIL — `Failed to resolve import "./freeze"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/oracle/freeze.ts`:

```ts
/**
 * freeze.ts — streak-freeze (Phase 2b). Cover-on-return: bridge a single missed
 * day when a player returns, by submitting a covered on-chain entry (txCount 0).
 * decideFreezeCover is pure; getLastValidDays / applyFreezeCovers do I/O.
 */
import { type Address, type PublicClient, parseAbi } from "viem";

const VAULT_ABI = parseAbi([
  "function getPlayerStats(uint256 roundId, address player) external view returns (uint8 streak, uint32 txCount, uint16 uniqueToCount, uint8 lastValidDay, bool claimed, bool entered)",
]);

/**
 * The day index to cover, or null. Covers exactly one missed day (lastValidDay+1)
 * only when the player is active again on lastValidDay+2, holds a token, and
 * hasn't used a freeze this round.
 */
export function decideFreezeCover(args: {
  lastValidDay: number;
  activeClosedDays: number[];
  freezeTokens: number;
  freezeUsedRound: number | null;
  currentRound: number;
}): number | null {
  const { lastValidDay, activeClosedDays, freezeTokens, freezeUsedRound, currentRound } = args;
  if (freezeTokens < 1) return null;
  if (freezeUsedRound === currentRound) return null;
  if (lastValidDay < 0 || lastValidDay > 6) return null; // 255 sentinel / invalid
  const returnDay = activeClosedDays.filter((d) => d > lastValidDay).sort((a, b) => a - b)[0];
  if (returnDay === undefined) return null;
  if (returnDay - lastValidDay !== 2) return null; // exactly one missed day
  return lastValidDay + 1;
}

/** Read each player's on-chain lastValidDay (255 = none) via one multicall. */
export async function getLastValidDays(
  client: PublicClient,
  vaultAddress: Address,
  roundId: bigint,
  players: Address[]
): Promise<Map<string, number>> {
  if (players.length === 0) return new Map();
  const calls = players.map((p) => ({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "getPlayerStats" as const,
    args: [roundId, p] as const,
  }));
  const results = await client.multicall({ contracts: calls });
  const map = new Map<string, number>();
  results.forEach((r, i) => {
    if (r.status === "success") {
      map.set(players[i].toLowerCase(), Number((r.result as unknown[])[3]));
    }
  });
  return map;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/freeze.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/freeze.ts frontend/lib/oracle/freeze.test.ts
git commit -m "feat(freeze): decideFreezeCover (pure) + getLastValidDays read"
```

---

### Task 3: `applyFreezeCovers` orchestration + `freezeEnabled`

**Files:**
- Modify: `frontend/lib/oracle/freeze.ts`
- Modify: `frontend/lib/oracle/freeze.test.ts`

**Interfaces:**
- Consumes: `getLastValidDays`, `decideFreezeCover` (this file); `readProfile`, `writeProfile` from `./profileStore`; `QualifyingTx`, `RoundInfo` from `./scanner`.
- Produces:
  - `freezeEnabled(): boolean` — `process.env.FREEZE_ENABLED !== "false"`.
  - `applyFreezeCovers(client: PublicClient, vaultAddress: Address, roundInfo: RoundInfo, qualifying: QualifyingTx[]): Promise<QualifyingTx[]>` — returns covered entries (`{player, roundId, dayIndex, txCount:0, uniqueToCount:0}`) and consumes a token per cover (`freezeTokens--`, `freezeUsedRound = round`). A profile read failure skips that player (no cover).

- [ ] **Step 1: Add the failing test**

In `frontend/lib/oracle/freeze.test.ts`, add a mocked profileStore at the top (with the other imports) and a test:

```ts
vi.mock("./profileStore", () => ({
  readProfile: vi.fn(),
  writeProfile: vi.fn(),
}));

import { applyFreezeCovers, freezeEnabled } from "./freeze";
import { readProfile, writeProfile } from "./profileStore";
import type { RoundInfo, QualifyingTx } from "./scanner";

const P = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x000000000000000000000000000000000000ba5e" as const;

describe("applyFreezeCovers", () => {
  function clientWithLastValid(day: number) {
    return {
      multicall: vi.fn(async () => [{ status: "success", result: [3, 0, 0, day, false, true] }]),
    } as any;
  }
  const roundInfo = { roundId: 7n, players: [P], vaultAddress: VAULT } as RoundInfo;

  it("covers a returning player's missed day and consumes a token", async () => {
    // lastValidDay 2, active again on day 4 (in qualifying) -> cover day 3
    (readProfile as any).mockResolvedValue({ xp: 300, cursor: null, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null });
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    const covered = await applyFreezeCovers(clientWithLastValid(2), VAULT, roundInfo, qualifying);
    expect(covered).toEqual([{ player: P, roundId: 7n, dayIndex: 3, txCount: 0, uniqueToCount: 0 }]);
    expect(writeProfile).toHaveBeenCalledWith(P.toLowerCase(), expect.objectContaining({ freezeTokens: 0, freezeUsedRound: 7 }));
  });

  it("returns no cover when the player has no token", async () => {
    (readProfile as any).mockResolvedValue({ xp: 0, cursor: null, freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null });
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    expect(await applyFreezeCovers(clientWithLastValid(2), VAULT, roundInfo, qualifying)).toEqual([]);
    expect(writeProfile).not.toHaveBeenCalled();
  });

  it("skips a player whose profile read returns null", async () => {
    (readProfile as any).mockResolvedValue(null);
    const qualifying: QualifyingTx[] = [{ player: P, roundId: 7n, dayIndex: 4, txCount: 2, uniqueToCount: 1 }];
    expect(await applyFreezeCovers(clientWithLastValid(2), VAULT, roundInfo, qualifying)).toEqual([]);
  });
});

describe("freezeEnabled", () => {
  it("defaults on, off only when explicitly 'false'", () => {
    delete process.env.FREEZE_ENABLED;
    expect(freezeEnabled()).toBe(true);
    process.env.FREEZE_ENABLED = "false";
    expect(freezeEnabled()).toBe(false);
    delete process.env.FREEZE_ENABLED;
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/freeze.test.ts -t applyFreezeCovers`
Expected: FAIL — `applyFreezeCovers`/`freezeEnabled` not exported.

- [ ] **Step 3: Implement**

Append to `frontend/lib/oracle/freeze.ts` (and add the imports at the top):

```ts
import type { QualifyingTx, RoundInfo } from "./scanner";
import { readProfile, writeProfile } from "./profileStore";
```

```ts
/** Streak-freeze on-chain apply is enabled unless FREEZE_ENABLED === "false". */
export function freezeEnabled(): boolean {
  return process.env.FREEZE_ENABLED !== "false";
}

/**
 * For each returning player with a coverable single-day gap, produce a covered
 * entry (txCount 0) to bridge the streak and consume one freeze token. A profile
 * read failure skips the player (never fabricates a cover).
 */
export async function applyFreezeCovers(
  client: PublicClient,
  vaultAddress: Address,
  roundInfo: RoundInfo,
  qualifying: QualifyingTx[]
): Promise<QualifyingTx[]> {
  const round = Number(roundInfo.roundId);
  const lastValid = await getLastValidDays(client, vaultAddress, roundInfo.roundId, roundInfo.players);

  const daysByPlayer = new Map<string, number[]>();
  for (const q of qualifying) {
    const key = q.player.toLowerCase();
    const list = daysByPlayer.get(key);
    if (list) list.push(q.dayIndex);
    else daysByPlayer.set(key, [q.dayIndex]);
  }

  const covered: QualifyingTx[] = [];
  for (const player of roundInfo.players) {
    const key = player.toLowerCase();
    const profile = await readProfile(key);
    if (!profile) continue;
    const coverDay = decideFreezeCover({
      lastValidDay: lastValid.get(key) ?? 255,
      activeClosedDays: daysByPlayer.get(key) ?? [],
      freezeTokens: profile.freezeTokens,
      freezeUsedRound: profile.freezeUsedRound,
      currentRound: round,
    });
    if (coverDay === null) continue;
    covered.push({ player, roundId: roundInfo.roundId, dayIndex: coverDay, txCount: 0, uniqueToCount: 0 });
    await writeProfile(key, { ...profile, freezeTokens: profile.freezeTokens - 1, freezeUsedRound: round });
  }
  return covered;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/freeze.test.ts && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/freeze.ts frontend/lib/oracle/freeze.test.ts
git commit -m "feat(freeze): applyFreezeCovers orchestration + FREEZE_ENABLED flag"
```

---

### Task 4: Wire freeze covers into the oracle run

**Files:**
- Modify: `frontend/lib/oracle/run.ts`
- Test: `frontend/lib/oracle/run.test.ts`

**Interfaces:**
- Consumes: `applyFreezeCovers`, `freezeEnabled` from `./freeze`.
- Produces: `runOracleScan` unchanged signature; covered entries merged into the batch and the batch sorted `(player, dayIndex)` so covered days precede return days.

- [ ] **Step 1: Add the failing test**

In `frontend/lib/oracle/run.test.ts`, add a mock for `./freeze` at the top with the others:

```ts
vi.mock("./freeze", () => ({
  applyFreezeCovers: vi.fn(async () => []),
  freezeEnabled: vi.fn(() => true),
}));
```

Add the import beside the others:

```ts
import { applyFreezeCovers } from "./freeze";
```

Add a new test (fake timers, one player, one closed day) proving a covered entry is merged and the batch is sorted covered-before-return:

```ts
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
  (applyFreezeCovers as any).mockResolvedValue([{ player: A, roundId: 7n, dayIndex: 0, txCount: 0, uniqueToCount: 0 }]);
  (checkAlreadySubmitted as any).mockResolvedValue(new Set());
  (batchSubmitStreaks as any).mockResolvedValue("0xhash");

  await runOracleScan({} as any, {} as any, { vaultAddress: VAULT, oracleAddress: ORACLE, apiKey: "k" });

  const submittedBatch = (batchSubmitStreaks as any).mock.calls[0][3];
  expect(submittedBatch.map((q: any) => q.dayIndex)).toEqual([0, 1]); // covered day 0 before return day 1
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/run.test.ts -t "freeze covers"`
Expected: FAIL — run.ts doesn't call `applyFreezeCovers` or merge/sort covers.

- [ ] **Step 3: Wire run.ts**

In `frontend/lib/oracle/run.ts`, add the import beside the other oracle imports:

```ts
import { applyFreezeCovers, freezeEnabled } from "./freeze";
```

Then replace the block from `console.log("Oracle: checking on-chain submission status...");` through the `unsubmitted` assignment (currently lines ~111-119) with:

```ts
  // Streak-freeze (Phase 2b): bridge a returning player's single missed day with
  // a covered on-chain entry (txCount 0). Gated + non-fatal.
  let covered: typeof qualifying = [];
  if (freezeEnabled()) {
    try {
      covered = await applyFreezeCovers(publicClient, vaultAddress, roundInfo, qualifying);
      if (covered.length) console.log(`Oracle: ${covered.length} streak-freeze cover(s) applied.`);
    } catch (e) {
      console.warn(`Oracle: freeze cover failed: ${(e as Error).message}`);
    }
  }

  // Sort by (player, dayIndex) so a covered day is always submitted before its
  // return day — the contract only extends the streak if the covered day lands
  // first (dayIndex == lastValidDay + 1).
  const toSubmit = [...qualifying, ...covered].sort(
    (a, b) =>
      a.player.toLowerCase().localeCompare(b.player.toLowerCase()) || a.dayIndex - b.dayIndex
  );

  console.log("Oracle: checking on-chain submission status...");
  const submitted = await checkAlreadySubmitted(publicClient, oracleAddress, toSubmit);
  const unsubmitted = toSubmit.filter(
    (q) => !submitted.has(`${q.player.toLowerCase()}:${q.roundId}:${q.dayIndex}`)
  );
```

(Everything after — the `unsubmitted.length === 0` return and `batchSubmitStreaks(…, unsubmitted)` — is unchanged and now submits the merged, sorted set.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/run.test.ts`
Expected: PASS. The existing tests still pass: `applyFreezeCovers` is mocked to `[]` by default, so `toSubmit` equals `qualifying` and prior assertions (e.g. the XP `awardXp` and provisional partition tests) hold; the new test asserts the covered-day ordering.

- [ ] **Step 5: Folder suite + type-check**

Run: `npx vitest run lib/oracle/ && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/run.ts frontend/lib/oracle/run.test.ts
git commit -m "feat(freeze): apply covers in the oracle run (sorted covered-before-return)"
```

---

### Task 5: Surface freeze tokens in the UI

**Files:**
- Modify: `frontend/app/api/profile/route.ts`
- Modify: `frontend/app/api/profile/route.test.ts`
- Modify: `frontend/hooks/useProfile.ts`
- Modify: `frontend/components/StreakCard.tsx`
- Modify: `frontend/components/StreakCard.test.tsx`

**Interfaces:**
- Produces: `/api/profile` also returns `freezeTokens`; `ProfileView` gains `freezeTokens`; `StreakCard`'s `profile` prop gains `freezeTokens` and renders a shield indicator when > 0.

- [ ] **Step 1: Update the route test + route**

In `frontend/app/api/profile/route.test.ts`, update the present-case expectation to include `freezeTokens`. Change the mocked resolve to include the field and the expected JSON:

```ts
    (readProfile as any).mockResolvedValue({ xp: 175, cursor: { round: 7, day: 2 }, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null });
    const res = await GET(req("http://x/api/profile?address=0xABC"));
    expect(await res.json()).toEqual({
      profile: { xp: 175, freezeTokens: 1, level: 2, xpIntoLevel: 75, xpForNextLevel: 150 },
    });
```

Run to confirm it fails: `npx vitest run app/api/profile/route.test.ts -t "derived profile"` → FAIL (freezeTokens missing).

In `frontend/app/api/profile/route.ts`, change the profile line:

```ts
  const profile = stored ? { xp: stored.xp, ...xpProgress(stored.xp) } : null;
```

to:

```ts
  const profile = stored
    ? { xp: stored.xp, freezeTokens: stored.freezeTokens, ...xpProgress(stored.xp) }
    : null;
```

- [ ] **Step 2: Update `ProfileView`**

In `frontend/hooks/useProfile.ts`, add `freezeTokens` to `ProfileView`:

```ts
export interface ProfileView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  freezeTokens: number;
}
```

- [ ] **Step 3: Add the failing StreakCard test**

In `frontend/components/StreakCard.test.tsx`, add:

```tsx
  it("shows a freeze-token indicator when the player holds tokens", () => {
    render(
      <StreakCard
        streak={3}
        todayDone
        profile={{ level: 2, xpIntoLevel: 75, xpForNextLevel: 150, freezeTokens: 2 }}
      />
    );
    expect(screen.getByText(/×\s*2/)).toBeInTheDocument();
  });

  it("shows no freeze indicator at zero tokens", () => {
    render(
      <StreakCard
        streak={3}
        todayDone
        profile={{ level: 2, xpIntoLevel: 75, xpForNextLevel: 150, freezeTokens: 0 }}
      />
    );
    expect(screen.queryByText(/🛡/)).not.toBeInTheDocument();
  });
```

Run to confirm it fails: `npx vitest run components/StreakCard.test.tsx -t "freeze-token"` → FAIL.

- [ ] **Step 4: Extend StreakCard**

In `frontend/components/StreakCard.tsx`, update the `profile` prop type to include `freezeTokens`:

```tsx
  profile?: { level: number; xpIntoLevel: number; xpForNextLevel: number; freezeTokens: number };
```

Inside the existing `{profile && ( … )}` block, add the shield next to the Level badge. Replace the badge row:

```tsx
          <div className="flex items-center justify-between">
            <span className="pill-muted num">Lv {profile.level}</span>
            <span className="text-[11px] text-ink-mute num">
              {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
            </span>
          </div>
```

with:

```tsx
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="pill-muted num">Lv {profile.level}</span>
              {profile.freezeTokens > 0 && (
                <span className="text-[11px] text-forest num" title="Streak-freeze tokens">
                  🛡 ×{profile.freezeTokens}
                </span>
              )}
            </span>
            <span className="text-[11px] text-ink-mute num">
              {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
            </span>
          </div>
```

- [ ] **Step 5: Type-check + full suite**

Run: `npm run type-check && npm test`
Expected: PASS. (`page.tsx` passes `profile={profile ?? undefined}` where `ProfileView` now carries `freezeTokens`, so the StreakCard prop is satisfied with no page change.)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api/profile/route.ts frontend/app/api/profile/route.test.ts frontend/hooks/useProfile.ts frontend/components/StreakCard.tsx frontend/components/StreakCard.test.tsx
git commit -m "feat(ui): show streak-freeze token count on the StreakCard"
```

> **Manual verification (needs KV + a real returning player):** with `FREEZE_ENABLED` unset (on) and KV set, a player who reaches L3, misses one day, and returns the next active day should keep their streak (a covered day appears on-chain with 0 Score), and their token count should drop by 1. With `FREEZE_ENABLED=false`, confirm no covered day is written.

---

## Final verification

- [ ] Full suite: `cd frontend && npm test` → all pass.
- [ ] Type-check: `npm run type-check` → clean.
- [ ] Manual (needs KV): grant path (reach L3 → token), cover path (miss one day, return → streak preserved, token −1, covered day on-chain has txCount 0), kill-switch (`FREEZE_ENABLED=false` → no cover).

## Spec coverage (self-review)

- Profile freeze fields + normalize old profiles → Task 1. ✓
- Grant 1 token / 3 levels, cap 2, idempotent → Task 1 (`grantFreezes`). ✓
- Cover-on-return decision (1-day gap, ≤1/round, no-consecutive, sentinel) → Task 2 (`decideFreezeCover`). ✓
- On-chain lastValidDay read → Task 2 (`getLastValidDays`). ✓
- Apply covers + consume token + fail-safe on read error → Task 3 (`applyFreezeCovers`). ✓
- `FREEZE_ENABLED` default-on kill-switch → Task 3 + Task 4 gate. ✓
- Merge + sort batch (covered before return) → Task 4. ✓
- UI freeze indicator + `/api/profile` field → Task 5. ✓
- No contract change; covered day adds zero Score → covered entries are `txCount:0/uniqueToCount:0`, submitted via existing path. ✓
- Manual "use" button / multi-day / "saved" toast → out of scope. ✓

## Notes for the implementer

- **Ordering is the safety-critical property.** The batch MUST be sorted so a covered day (`L+1`) precedes the return day (`L+2`) for the same player; the contract only extends the streak when `dayIndex == lastValidDay + 1`. Task 4's sort guarantees this.
- **Fail-safe, not fail-open:** a profile read error in `applyFreezeCovers` yields null → skip (no cover). Never fabricate a cover on missing data.
- `FREEZE_ENABLED` is default-ON (off only on the exact string `"false"`); granting runs regardless, only the on-chain apply is gated.
- Old Phase-2a profiles (missing freeze fields) are normalized on read — verify the normalize is applied in BOTH `readProfile` and `readProfileStrict`.
