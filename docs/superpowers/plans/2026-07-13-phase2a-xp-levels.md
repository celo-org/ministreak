# Phase 2a — XP, Levels & Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an off-chain XP + Levels retention loop — the oracle awards XP for active days, a KV-backed per-player profile stores it, and the player's StreakCard shows their Level and XP progress. No on-chain writes; no contract change.

**Architecture:** Pure XP/level math (`lib/xp.ts`) + a KV profile store (`lib/oracle/profileStore.ts`) with an idempotent `awardXp` orchestration hooked into the existing oracle `run.ts` (alongside the provisional write). A `/api/profile` route serves the derived profile; a `useProfile` hook feeds the StreakCard. Degrades to today's UI when KV/profile is absent.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@vercel/kv`, @tanstack/react-query (^5), Vitest.

## Global Constraints

- **No contract change; no on-chain writes.** XP/levels are entirely off-chain (streak-freeze, the on-chain part, is Phase 2b — out of scope here).
- **Reuses the existing Vercel KV + oracle scan.** KV failures are **non-fatal** — they must never break the oracle's submission path or the leaderboard. Reads return null on miss/error; UI degrades.
- **XP formula:** `xpForDay(streak) = 10 + (streak − 1) × 5` (min streak effect 0). Awarded per **active closed day** (`dayIndex < currentDayIndex`), idempotent per player via a stored cursor.
- **Level curve:** `levelThreshold(n) = 50 × (n(n+1)/2 − 1)` for `n ≥ 1` (threshold(1)=0). Level = largest `n` with `threshold(n) ≤ xp`.
- **KV keys:** `profile:<lowercased address>` (persistent, no TTL).
- **Cosmetics minimal:** own-profile Level/XP on the StreakCard only. No shared-leaderboard badges.
- **All commands run from `frontend/`.** Test: `npm test` / `npx vitest run <path>`. Commit per task. TDD, DRY, YAGNI.

---

### Task 1: XP/level math (`lib/xp.ts`, pure)

**Files:**
- Create: `frontend/lib/xp.ts`
- Test: `frontend/lib/xp.test.ts`

**Interfaces:**
- Produces: `xpForDay(streakThatDay: number): number`; `levelThreshold(n: number): number`; `levelForXp(xp: number): number`; `xpProgress(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number }`; `computeXpGrant(activeClosedDays: number[], round: number, cursor: { round: number; day: number } | null): { awardedXp: number; newCursor: { round: number; day: number } }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/xp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { xpForDay, levelThreshold, levelForXp, xpProgress, computeXpGrant } from "./xp";

describe("xpForDay", () => {
  it("is 10 on day 1 and escalates +5 per streak-day", () => {
    expect(xpForDay(1)).toBe(10);
    expect(xpForDay(2)).toBe(15);
    expect(xpForDay(7)).toBe(40);
  });
  it("never goes below the base for streak 0/negative", () => {
    expect(xpForDay(0)).toBe(10);
  });
});

describe("levelThreshold / levelForXp", () => {
  it("matches the published thresholds", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(levelThreshold)).toEqual([0, 100, 250, 450, 700, 1000, 1350]);
  });
  it("maps xp to the highest reached level", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(249)).toBe(2);
    expect(levelForXp(250)).toBe(3);
    expect(levelForXp(1350)).toBe(7);
  });
});

describe("xpProgress", () => {
  it("reports progress within the current level", () => {
    expect(xpProgress(175)).toEqual({ level: 2, xpIntoLevel: 75, xpForNextLevel: 150 }); // L2 base 100, L3 250
  });
});

describe("computeXpGrant", () => {
  it("awards the escalating XP for a fresh consecutive run", () => {
    const { awardedXp, newCursor } = computeXpGrant([0, 1, 2], 7, null);
    expect(awardedXp).toBe(10 + 15 + 20); // 45
    expect(newCursor).toEqual({ round: 7, day: 2 });
  });
  it("resets the escalation after a gap", () => {
    const { awardedXp } = computeXpGrant([0, 1, 3], 7, null); // gap at day 2
    expect(awardedXp).toBe(10 + 15 + 10); // day 3 restarts at 10
  });
  it("only awards days after the cursor within the same round", () => {
    const { awardedXp, newCursor } = computeXpGrant([0, 1, 2], 7, { round: 7, day: 1 });
    expect(awardedXp).toBe(20); // only day 2, streak run 0-1-2 = 3 -> 20
    expect(newCursor).toEqual({ round: 7, day: 2 });
  });
  it("is idempotent when nothing is new", () => {
    expect(computeXpGrant([0, 1, 2], 7, { round: 7, day: 2 })).toEqual({
      awardedXp: 0,
      newCursor: { round: 7, day: 2 },
    });
  });
  it("resets the cursor and awards from day 0 in a new round", () => {
    const { awardedXp, newCursor } = computeXpGrant([0], 8, { round: 7, day: 2 });
    expect(awardedXp).toBe(10);
    expect(newCursor).toEqual({ round: 8, day: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/xp.test.ts`
Expected: FAIL — `Failed to resolve import "./xp"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/xp.ts`:

```ts
/**
 * xp.ts — pure XP/level math for the off-chain retention layer.
 */
export const XP_BASE = 10;
export const XP_STREAK_STEP = 5;

/** XP earned for completing a day, given that day's trailing streak length. */
export function xpForDay(streakThatDay: number): number {
  return XP_BASE + Math.max(0, streakThatDay - 1) * XP_STREAK_STEP;
}

/** Cumulative XP required to reach level n (n >= 1). threshold(1) = 0. */
export function levelThreshold(n: number): number {
  return 50 * ((n * (n + 1)) / 2 - 1);
}

/** Highest level whose threshold is <= xp. */
export function levelForXp(xp: number): number {
  let n = 1;
  while (levelThreshold(n + 1) <= xp) n++;
  return n;
}

export function xpProgress(xp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
} {
  const level = levelForXp(xp);
  const base = levelThreshold(level);
  const next = levelThreshold(level + 1);
  return { level, xpIntoLevel: xp - base, xpForNextLevel: next - base };
}

/**
 * XP to award this run and the advanced cursor. Awards only active closed days
 * newer than the cursor (within the same round; a new round starts fresh).
 * streakThatDay is the consecutive run of active days ending at that day.
 */
export function computeXpGrant(
  activeClosedDays: number[],
  round: number,
  cursor: { round: number; day: number } | null
): { awardedXp: number; newCursor: { round: number; day: number } } {
  const days = [...new Set(activeClosedDays)].sort((a, b) => a - b);
  const daySet = new Set(days);
  const startAfter = cursor && cursor.round === round ? cursor.day : -1;
  const newDays = days.filter((d) => d > startAfter);

  let awardedXp = 0;
  for (const d of newDays) {
    let streak = 0;
    for (let k = d; k >= 0 && daySet.has(k); k--) streak++;
    awardedXp += xpForDay(streak);
  }

  const newCursor = newDays.length
    ? { round, day: newDays[newDays.length - 1] }
    : cursor ?? { round, day: -1 };
  return { awardedXp, newCursor };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/xp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/xp.ts frontend/lib/xp.test.ts
git commit -m "feat(xp): pure XP/level math + idempotent grant"
```

---

### Task 2: Profile store + `awardXp` (`lib/oracle/profileStore.ts`)

**Files:**
- Create: `frontend/lib/oracle/profileStore.ts`
- Test: `frontend/lib/oracle/profileStore.test.ts`

**Interfaces:**
- Consumes: `computeXpGrant` from `@/lib/xp`; `QualifyingTx` from `./scanner`.
- Produces: type `Profile = { xp: number; cursor: { round: number; day: number } | null }`; `readProfile(address: string): Promise<Profile | null>` (null on miss/error, never throws); `writeProfile(address: string, profile: Profile): Promise<void>`; `awardXp(closedEntries: QualifyingTx[], round: number): Promise<void>` (groups by player, awards idempotently).

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/oracle/profileStore.test.ts`:

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

import { readProfile, writeProfile, awardXp, type Profile } from "./profileStore";
import type { QualifyingTx } from "./scanner";
import { kv } from "@vercel/kv";

const A = "0xAAAA000000000000000000000000000000000000";
const entry = (player: string, dayIndex: number): QualifyingTx =>
  ({ player: player as `0x${string}`, roundId: 7n, dayIndex, txCount: 1, uniqueToCount: 1 });

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe("readProfile / writeProfile", () => {
  it("round-trips a profile under profile:<lowercased address>", async () => {
    const p: Profile = { xp: 45, cursor: { round: 7, day: 2 } };
    await writeProfile(A.toUpperCase(), p);
    expect(kv.set).toHaveBeenCalledWith(`profile:${A.toLowerCase()}`, p);
    expect(await readProfile(A)).toEqual(p);
  });
  it("returns null on a miss and never throws on error", async () => {
    expect(await readProfile("0xnope")).toBeNull();
    (kv.get as any).mockRejectedValueOnce(new Error("kv down"));
    expect(await readProfile(A)).toBeNull();
  });
});

describe("awardXp", () => {
  it("awards escalating XP for a player's closed days and advances the cursor", async () => {
    await awardXp([entry(A, 0), entry(A, 1), entry(A, 2)], 7);
    expect(await readProfile(A)).toEqual({ xp: 45, cursor: { round: 7, day: 2 } }); // 10+15+20
  });
  it("is idempotent — re-running awards nothing more", async () => {
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    expect(await readProfile(A)).toEqual({ xp: 25, cursor: { round: 7, day: 1 } });
  });
  it("accumulates across successive runs", async () => {
    await awardXp([entry(A, 0)], 7);
    await awardXp([entry(A, 0), entry(A, 1)], 7);
    expect((await readProfile(A))!.xp).toBe(25); // 10 then +15
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/profileStore.test.ts`
Expected: FAIL — `Failed to resolve import "./profileStore"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/lib/oracle/profileStore.ts`:

```ts
/**
 * profileStore.ts — Vercel KV persistence for per-player XP/level profiles, plus
 * awardXp (idempotent XP grant for closed active days). Reads never throw; the
 * caller treats writes as non-fatal.
 */
import { kv } from "@vercel/kv";
import { computeXpGrant } from "@/lib/xp";
import type { QualifyingTx } from "./scanner";

export interface Profile {
  xp: number;
  cursor: { round: number; day: number } | null;
}

const KEY = (address: string) => `profile:${address.toLowerCase()}`;

export async function readProfile(address: string): Promise<Profile | null> {
  try {
    const p = await kv.get<Profile>(KEY(address));
    return p ?? null;
  } catch (e) {
    console.warn(`readProfile failed for ${address}:`, (e as Error).message);
    return null;
  }
}

export async function writeProfile(address: string, profile: Profile): Promise<void> {
  await kv.set(KEY(address), profile);
}

/**
 * Award XP for closed active days across every player in the batch. Idempotent
 * per player via the stored cursor, so it is safe to call on every scan.
 */
export async function awardXp(closedEntries: QualifyingTx[], round: number): Promise<void> {
  const byPlayer = new Map<string, number[]>();
  for (const e of closedEntries) {
    const key = e.player.toLowerCase();
    const list = byPlayer.get(key);
    if (list) list.push(e.dayIndex);
    else byPlayer.set(key, [e.dayIndex]);
  }

  for (const [address, days] of byPlayer) {
    const profile = (await readProfile(address)) ?? { xp: 0, cursor: null };
    const { awardedXp, newCursor } = computeXpGrant(days, round, profile.cursor);
    if (awardedXp > 0) {
      await writeProfile(address, { xp: profile.xp + awardedXp, cursor: newCursor });
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/profileStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/profileStore.ts frontend/lib/oracle/profileStore.test.ts
git commit -m "feat(xp): KV profile store + idempotent awardXp"
```

---

### Task 3: Award XP in the oracle run (`run.ts`)

**Files:**
- Modify: `frontend/lib/oracle/run.ts`
- Test: `frontend/lib/oracle/run.test.ts`

**Interfaces:**
- Consumes: `awardXp` from `./profileStore`.
- Produces: `runOracleScan` unchanged signature; XP is awarded for the closed-day `qualifying` set each run, non-fatal.

- [ ] **Step 1: Add the failing test**

In `frontend/lib/oracle/run.test.ts`, add a mock for the profile store alongside the existing `vi.mock` calls at the top:

```ts
vi.mock("./profileStore", () => ({
  awardXp: vi.fn(),
}));
```

Add this import beside the existing imports (do not duplicate any already present):

```ts
import { awardXp } from "./profileStore";
```

Then add an assertion to the existing partition test (the one that sets fake timers with `currentDayIndex = 2` and asserts `batchSubmitStreaks` got only the day-1 entry). Immediately after that test's existing `expect(batchSubmitStreaks)...` assertion, add:

```ts
  // XP awarded for the closed day(s) only, with the numeric round id.
  expect(awardXp).toHaveBeenCalledWith(
    [{ player: A, roundId: 7n, dayIndex: 1, txCount: 2, uniqueToCount: 2 }],
    7
  );
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/oracle/run.test.ts`
Expected: FAIL — `awardXp` is never called (run.ts doesn't invoke it yet).

- [ ] **Step 3: Wire run.ts**

In `frontend/lib/oracle/run.ts`, add the import beside the existing oracle imports:

```ts
import { awardXp } from "./profileStore";
```

Then, immediately after the closed-day `qualifying` early-return block (the lines `const qualifying = allWithLoyalty.filter((q) => q.dayIndex < currentDayIndex);` … `if (qualifying.length === 0) { return { ...base, noActivity }; }`), insert:

```ts
  // Award retention XP for closed active days (KV-backed, non-fatal). Idempotent
  // per player via a stored cursor, so it is safe to run on every scan.
  try {
    await awardXp(qualifying, Number(roundInfo.roundId));
  } catch (e) {
    console.warn(`Oracle: XP award failed: ${(e as Error).message}`);
  }
```

(The subsequent `checkAlreadySubmitted` / submission lines are unchanged. XP uses `qualifying` — all closed days — not `unsubmitted`, so it is independent of on-chain submission status and stays correct even across reruns.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/oracle/run.test.ts`
Expected: PASS (existing tests still green — the loyalty test with `startTime: 0n` calls the mocked `awardXp` with its closed days, which it doesn't assert).

- [ ] **Step 5: Folder suite + type-check**

Run: `npx vitest run lib/oracle/ && npm run type-check`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/oracle/run.ts frontend/lib/oracle/run.test.ts
git commit -m "feat(xp): award retention XP for closed days in the oracle run"
```

---

### Task 4: `/api/profile` route

**Files:**
- Create: `frontend/app/api/profile/route.ts`
- Test: `frontend/app/api/profile/route.test.ts`

**Interfaces:**
- Consumes: `readProfile` from `@/lib/oracle/profileStore`; `xpProgress` from `@/lib/xp`.
- Produces: `GET /api/profile?address=` → `{ profile: { xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number } | null }`. Never throws; 400 + `{ profile: null }` when address missing.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/api/profile/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/oracle/profileStore", () => ({
  readProfile: vi.fn(),
}));

import { GET } from "./route";
import { readProfile } from "@/lib/oracle/profileStore";

const req = (url: string) => new Request(url) as any;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/profile", () => {
  it("returns the derived profile (with level) for an address", async () => {
    (readProfile as any).mockResolvedValue({ xp: 175, cursor: { round: 7, day: 2 } });
    const res = await GET(req("http://x/api/profile?address=0xABC"));
    expect(await res.json()).toEqual({
      profile: { xp: 175, level: 2, xpIntoLevel: 75, xpForNextLevel: 150 },
    });
    expect(readProfile).toHaveBeenCalledWith("0xABC");
  });
  it("returns { profile: null } when absent", async () => {
    (readProfile as any).mockResolvedValue(null);
    const res = await GET(req("http://x/api/profile?address=0xABC"));
    expect(await res.json()).toEqual({ profile: null });
  });
  it("returns { profile: null } with 400 when address is missing", async () => {
    const res = await GET(req("http://x/api/profile"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ profile: null });
    expect(readProfile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/profile/route.test.ts`
Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the route**

Create `frontend/app/api/profile/route.ts`:

```ts
import { NextResponse } from "next/server";
import { readProfile } from "@/lib/oracle/profileStore";
import { xpProgress } from "@/lib/xp";

// Public, read-only per-player XP/level profile. Never cached.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) {
    return NextResponse.json({ profile: null }, { status: 400 });
  }
  const stored = await readProfile(address);
  const profile = stored ? { xp: stored.xp, ...xpProgress(stored.xp) } : null;
  return NextResponse.json(
    { profile },
    { headers: { "cache-control": "no-store" } }
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/api/profile/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/api/profile/route.ts frontend/app/api/profile/route.test.ts
git commit -m "feat(api): /api/profile route serving derived XP/level"
```

---

### Task 5: StreakCard Level + XP UI

**Files:**
- Create: `frontend/hooks/useProfile.ts`
- Modify: `frontend/components/StreakCard.tsx`
- Modify: `frontend/components/StreakCard.test.tsx`
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `/api/profile`; `xpForDay` from `@/lib/xp` (for the today-projection).
- Produces: `useProfile(address?: string): { profile: { xp: number; level: number; xpIntoLevel: number; xpForNextLevel: number } | null }`. `StreakCard` gains optional `profile?: { level: number; xpIntoLevel: number; xpForNextLevel: number }` and `todayXp?: number` props; renders a Level badge + XP bar when `profile` is set, and a "+X XP" chip when `todayXp` is set. Absent → renders exactly as today.

- [ ] **Step 1: Add the failing StreakCard tests**

In `frontend/components/StreakCard.test.tsx`, add:

```tsx
  it("shows the Level badge and XP bar when a profile is provided", () => {
    render(
      <StreakCard
        streak={3}
        todayDone
        profile={{ level: 2, xpIntoLevel: 75, xpForNextLevel: 150 }}
      />
    );
    expect(screen.getByText(/Lv\s*2/i)).toBeInTheDocument();
    expect(screen.getByText(/75\s*\/\s*150\s*XP/i)).toBeInTheDocument();
  });

  it("renders no Level badge without a profile", () => {
    render(<StreakCard streak={3} todayDone />);
    expect(screen.queryByText(/Lv\s*\d/i)).not.toBeInTheDocument();
  });

  it("shows a today-XP chip when todayXp is set", () => {
    render(<StreakCard streak={0} todayDone optimistic todayXp={15} />);
    expect(screen.getByText(/\+15\s*XP/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/StreakCard.test.tsx -t "Level badge"`
Expected: FAIL — props/rendering don't exist.

- [ ] **Step 3: Extend StreakCard**

In `frontend/components/StreakCard.tsx`, replace the props interface:

```tsx
interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  optimistic?: boolean;
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
  profile?: { level: number; xpIntoLevel: number; xpForNextLevel: number };
  todayXp?: number;
}
```

Update the destructure to include `profile` and `todayXp`. Then add the today-XP chip inside the right-hand column, right after the pill block (after the `todayDone ? … : …` span, still inside `<div className="text-right">`):

```tsx
          {todayXp !== undefined && todayXp > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-forest num">+{todayXp} XP</p>
          )}
```

Then add the Level badge + XP bar as a new block just before the closing `</div>` of the card (after the existing `{!todayDone && streak > 0 && ( … )}` nudge block):

```tsx
      {profile && (
        <div className="mt-4 pt-4 border-t border-rule">
          <div className="flex items-center justify-between">
            <span className="pill-muted num">Lv {profile.level}</span>
            <span className="text-[11px] text-ink-mute num">
              {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-paper-deep overflow-hidden">
            <div
              className="h-full bg-forest rounded-full"
              style={{
                width: `${Math.min(100, Math.round((profile.xpIntoLevel / Math.max(1, profile.xpForNextLevel)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/StreakCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the `useProfile` hook**

Create `frontend/hooks/useProfile.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";

export interface ProfileView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

export function useProfile(address?: string): { profile: ProfileView | null } {
  const { data } = useQuery({
    queryKey: ["profile", address],
    enabled: !!address,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ProfileView | null> => {
      const res = await fetch(`/api/profile?address=${address}`, { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as { profile: ProfileView | null };
      return json.profile;
    },
  });
  return { profile: data ?? null };
}
```

- [ ] **Step 6: Wire the hook into the home page**

In `frontend/app/page.tsx`, add imports:

```tsx
import { useProfile } from "@/hooks/useProfile";
import { xpForDay } from "@/lib/xp";
```

After the existing `optimisticToday` derivation, add:

```tsx
  const { profile } = useProfile(address);
  // Projected XP for today, shown while it's still optimistic (finalizes at day-close).
  const todayXp = optimisticToday ? xpForDay(Number(stats?.streak ?? 0) + 1) : undefined;
```

Then update the `<StreakCard … />` usage to pass them:

```tsx
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayDone || hasActivityToday}
          optimistic={optimisticToday}
          isLoading={statsLoading}
          profile={profile ?? undefined}
          todayXp={todayXp}
        />
```

- [ ] **Step 7: Type-check + full suite**

Run: `npm run type-check && npm test`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/hooks/useProfile.ts frontend/components/StreakCard.tsx frontend/components/StreakCard.test.tsx frontend/app/page.tsx
git commit -m "feat(ui): StreakCard Level badge + XP progress"
```

> **Manual verification (needs KV):** with KV env vars set, run the oracle once after a day closes, then load the app connected as an active player and confirm the Level badge + XP bar appear and advance. Without KV, confirm the StreakCard renders unchanged (no badge).

---

## Final verification

- [ ] Full suite: `cd frontend && npm test` → all pass.
- [ ] Type-check: `npm run type-check` → clean.
- [ ] Manual (needs KV env vars): oracle run after a day-close writes `profile:<addr>`; StreakCard shows Level/XP; without KV, StreakCard is unchanged.

## Spec coverage (self-review)

- XP formula + escalation → Task 1 (`xpForDay`), consumed in Task 2. ✓
- Level curve + progress → Task 1. ✓
- Idempotent per-player award (cursor) → Task 1 (`computeXpGrant`) + Task 2 (`awardXp`). ✓
- KV profile store, read-never-throws, non-fatal writes → Task 2 + Task 3 (try/catch). ✓
- Oracle awards XP for closed days → Task 3. ✓
- `/api/profile` derived + null fallback → Task 4. ✓
- StreakCard Level/XP UI + today projection + degrade → Task 5. ✓
- No on-chain writes / no contract change → whole plan is `frontend/`-only, no submitter/contract calls added. ✓
- Streak-freeze, leaderboard badges, onboarding → intentionally out of scope. ✓

## Notes for the implementer

- XP uses the **closed-day** `qualifying` set (`dayIndex < currentDayIndex`), NOT `unsubmitted` — so it's independent of on-chain submission status and idempotency comes from the KV cursor, not the submission batch.
- `writeProfile` has **no TTL** (profiles are permanent); only the provisional snapshot uses a TTL.
- KV is optional at runtime: absent env → `readProfile`/route return null → StreakCard renders as today. Never throw to the client.
- Phase 2b (streak-freeze) will add freeze-token fields to `Profile` and grant them at level milestones — keep `Profile` easy to extend.
