# Phase 2a — XP, Levels & Profile Design

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Origin:** Phase 2 of the MiniPay retention work, split into 2a (XP/levels/profile — this doc,
pure off-chain) and 2b (streak-freeze — the on-chain part, planned separately). Gives players a
daily-return reward loop on top of the streak game.

---

## 1. Scope & constraints

- **Phase 2a only:** XP + Levels + a per-player profile + minimal own-profile UI. **No on-chain
  writes.** Streak-freeze (the only on-chain part) is Phase 2b.
- **No contract change.** XP/levels are entirely off-chain, derived server-side from the oracle's
  existing all-days scan.
- **Model B:** this is the retention layer, separate from the money layer. It does **not** change
  ranking, submission timing, or payout.
- **Reuses** the Vercel KV store and the `run.ts` oracle cron introduced by the live-provisional
  work. Provisioning KV activates the provisional leaderboard AND Phase 2a together.
- **Degrades cleanly:** KV absent/unset/error → no level/XP shown; the app renders as today.

## 2. XP model

XP is awarded per **active day** (a day the player has a streak entry — includes the entry day),
computed by the oracle, and **persists across rounds**.

```
xpForDay(streakThatDay) = 10 + (streakThatDay − 1) × 5
```

Within a round: day 1 = 10, day 2 = 15, … day 7 = 40; a perfect week ≈ **175 XP**. The
escalation rewards consecutive daily return; a gap resets the streak, so the bonus resets too
(the day after a gap is worth 10 again). All numbers are tunable config.

### Idempotency (award once per player-day)
The oracle awards XP only for **closed** active days (`dayIndex < currentDayIndex`), matching
on-chain finalization. Each player's profile holds a **cursor** = the highest `{round, day}` XP
was granted for. Each run:
- If `cursor.round === currentRound`: award for active closed days with `dayIndex > cursor.day`.
- If new round (`cursor` absent or `cursor.round < currentRound`): award all active closed days
  from day 0.
- `streakThatDay` for a day D is the consecutive run of active days ending at D (over the
  player's full active-day set, not just the newly-awarded ones — the run doesn't reset because
  earlier days were already awarded).

Re-running a scan awards nothing new (days ≤ cursor are skipped). Cursor advances monotonically
within a round; when a round resolves, all its days are closed and awarded before the next round.

## 3. Level curve

Level is **derived** from cumulative XP (not stored). Gentle, legible thresholds:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Cumulative XP | 0 | 100 | 250 | 450 | 700 | 1000 | 1350 |

Increments grow 100 → 150 → 200 → 250 → 300 → 350. Closed form (so levels extend past 7 with no
cap): `threshold(n) = 50 × (n(n+1)/2 − 1)` for `n ≥ 1` (threshold(1) = 0). `levelForXp(xp)` =
the largest `n` with `threshold(n) ≤ xp`. These thresholds are what **Phase 2b's freeze
milestones** will hang off.

## 4. Storage — Vercel KV

- Key `profile:<lowercased address>` → `{ xp: number, cursor: { round: number, day: number } | null }`.
- Persistent, per player. Level and progress are derived from `xp` at read time (not stored).
- Read/write isolated in a store module; **writes are non-fatal** (a KV failure never breaks the
  oracle's submission path). Reads return null on miss/error (UI degrades).
- Per-run cost: the cron reads each active player's profile (to get the cursor) and writes only
  those who earned XP this run (usually few — most runs are between day boundaries). At current
  scale this is trivial; a KV pipeline / `mget` is the scale optimization, noted not built.

## 5. Oracle cron integration (`run.ts`)

After the existing scan + loyalty + provisional-write, add an XP step:
- For each player, take their active **closed** days from the loyalty-applied scan entries.
- Read `profile:<addr>`; compute the XP grant (Section 2) via a pure function; if > 0, write the
  updated `{ xp, cursor }`.
- Wrapped in try/catch, non-fatal — mirrors the provisional write.

Pure, unit-tested helpers (no I/O):
- `xpForDay(streakThatDay: number): number`
- `computeXpGrant(activeClosedDays: number[], round: number, cursor: {round:number,day:number} | null): { awardedXp: number, newCursor: {round:number,day:number} }`
- `levelForXp(xp: number): number`
- `xpProgress(xp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number }`

## 6. API route

`GET /api/profile?address=<addr>` → `{ profile: { xp, level, xpIntoLevel, xpForNextLevel } | null }`.
- Reads `profile:<addr>` from KV, derives level/progress, returns null when absent. Never throws
  (mirrors `/api/provisional`). `force-dynamic`, no-store.

## 7. UI (minimal cosmetics)

- New hook `useProfile(address)` → fetches `/api/profile` via react-query (60s refetch).
- **StreakCard** gains: a **Level badge** (e.g. "Lv 3") and an **XP progress bar** (xpIntoLevel /
  xpForNextLevel), plus a small **"+X XP today"** projection (today's provisional XP, since actual
  XP finalizes at day-close — consistent with the optimistic streak).
- Cosmetics are **own-profile only** for 2a. No per-player level badges on the shared leaderboard
  (deferred), no frames.
- Absent profile → StreakCard renders exactly as today (no badge/bar).

## 8. Testing

- Unit (pure): `xpForDay`; `levelForXp` / `xpProgress` across thresholds and past level 7;
  `computeXpGrant` — same-round incremental award, new-round reset, gap-resets-escalation,
  entry-day, no-new-days (0 awarded), idempotent re-run.
- Store: `profileStore` read/write with a mocked `@vercel/kv` (read never throws).
- Route: `/api/profile` returns derived profile, null when absent, never throws.
- Cron: `run.ts` awards XP for newly-closed days and is non-fatal on KV failure (extend
  `run.test.ts`).
- UI: `useProfile` pure parts + StreakCard badge/bar rendering (present when profile set, absent
  otherwise).

## 9. Out of scope (deliberate)

- **Streak-freeze** → Phase 2b (scarce & precious: 1 token at set level milestones, hold max ~2,
  ≤1 use per round, no current-day or consecutive-day cover; the only on-chain-writing part).
- Per-player level badges / frames on the shared leaderboard → later polish.
- Onboarding → Phase 3.

## 10. Tunable config (defaults)

| Knob | Default |
|---|---|
| XP base per active day | 10 |
| XP streak escalation | +5 per streak-day |
| Level thresholds | `50 × (n(n+1)/2 − 1)` |
