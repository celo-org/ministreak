# Live Provisional Leaderboard — Design

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan
**Origin:** After Phase 1 moved streak submission to day-close, the on-chain streak/leaderboard
lags up to ~24h mid-round (a player who enters and transacts sees streak 0 until the day
closes). We want the leaderboard to show **live provisional standings** — today's activity
folded in and re-ranked — while keeping the accurate, non-farmable **on-chain submission at
day-close** unchanged.

---

## 1. Guiding split

- **On-chain = source of truth, unchanged.** Streaks/scores are still submitted only after a
  day closes (Phase 1 behavior). Payout still comes from the on-chain final scan after the
  round ends. No contract change.
- **Off-chain provisional = display only.** A small store holds *today's* provisional scores
  for all players, refreshed each cron run. The leaderboard merges on-chain confirmed values
  with today's provisional and re-ranks. It never rewrites what's locked on-chain.

## 2. Key cost insight

The oracle cron already fetches every player's full tx history since round-start on each run
(it only filters *today* out before submitting). So computing today's provisional score for
all players reuses data already fetched — **near-zero extra explorer-API load**. We bucket the
open day with the same rate-cap + loyalty logic Phase 1 uses for closed days, and write the
result to the store instead of submitting it.

Edge: on a round's very first day, before it closes, the normal scan short-circuits
(`getRoundDayWindows(..., {closedOnly:true})` returns `[]`) and fetches nothing. The
provisional step therefore does its own all-players fetch so day-0 provisional works.

## 3. Decisions (locked)

| Decision | Choice |
|---|---|
| Scope | Whole leaderboard, all players |
| Ranking | Re-rank live (today's provisional changes rank order) |
| Freshness | 30-min cron only (no cadence change, no per-user hybrid) |
| Store | **Vercel KV** (managed Redis) — same store Phase 2 reuses |
| Sequencing | Standalone PR now; lays the KV foundation for Phase 2 |

## 4. Architecture & data flow

```
oracle cron (every 30 min)  [frontend/lib/oracle/run.ts + new provisional step]
  ├─ ONE all-days scan of every player (closedOnly:false → closed days + the open day)
  ├─ (unchanged) CLOSED days → apply loyalty → submit on-chain
  └─ (new)       OPEN day    → apply loyalty → write provisional snapshot to Vercel KV

API route GET /api/provisional?roundId=   [frontend/app/api/provisional/route.ts]
  → reads the KV snapshot, returns today's per-player provisional (or 404/empty if none)

Leaderboard UI  [frontend/hooks/useLeaderboard.ts + Leaderboard.tsx]
  ├─ reads on-chain getLeaderboard(roundId)  (confirmed through last closed day)
  ├─ reads /api/provisional?roundId=          (today)
  ├─ merges per player, re-sorts by streak → Score → uniqueTo
  └─ renders with a "LIVE · updates ~30 min" badge; falls back to on-chain if no provisional
```

## 5. Provisional computation (in the cron)

**Single-scan principle:** to keep the cost near-zero, the cron performs **one** all-players
scan with `closedOnly: false` (all day windows, including the open day) and splits the result:
closed-day entries go to the existing on-chain submit path; the open-day entries feed the
provisional snapshot. It must NOT run a second full scan for provisional. This likely means a
`scanAllPlayers` variant (or option) that returns all days rather than the hardcoded
`closedOnly: true`, with `run.ts` partitioning by whether each day's window has closed.

New module `frontend/lib/oracle/provisional.ts`:

- `computeProvisional(allDayEntries, openDayIndex, roundInfo) → ProvisionalSnapshot`
  - `allDayEntries` = the loyalty-applied per-player, per-day entries from the shared scan
    (all days, closed + open). Pure — does no fetching (the shared scan already did it).
  - Group entries by player; for each player derive:
    - `todayScore` / `todayUniqueTo` — from the entry whose `dayIndex === openDayIndex`
      (0 if the player has no open-day entry).
    - `active` — whether an open-day entry exists for the player.
    - `streak` — the **correct provisional streak**: the length of the consecutive run of
      active day-indexes ending at the most recent active day (the open day if active today,
      else the last active closed day). Computed from the player's full set of active
      day-indexes, so "missed a day → streak resets" is handled properly (not a naive
      on-chain + 1).
- Write the snapshot to KV under `provisional:<roundId>` (Section 6).

`ProvisionalSnapshot`:
```ts
interface ProvisionalPlayer {
  streak: number;        // correct provisional streak through today
  todayScore: number;    // today's counted, loyalty-applied points (additive to on-chain)
  todayUniqueTo: number; // today's counted unique recipients (additive)
  active: boolean;       // has a qualifying tx today
}
interface ProvisionalSnapshot {
  roundId: string;
  dayIndex: number;      // the open day index
  updatedAt: number;     // unix seconds
  players: Record<string /* lowercased addr */, ProvisionalPlayer>;
}
```

The cron writes this after its existing submit step (a failed KV write must not break
submission — wrap in try/catch, log, continue).

## 6. Storage — Vercel KV

- One key per round: `provisional:<roundId>`, value = `ProvisionalSnapshot` (JSON), overwritten
  each run. Optional TTL (e.g. 3h) so stale rounds self-expire.
- Client: `@vercel/kv`, configured via the KV env vars Vercel injects
  (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, …).
- **Setup (one-time, user action):** provision a KV database in the Vercel dashboard and link
  it to the project; env vars are added automatically. Documented in the plan.

## 7. API route

`GET /api/provisional?roundId=<id>` → `frontend/app/api/provisional/route.ts`
- Reads `provisional:<roundId>` from KV.
- Returns `{ snapshot }` or `{ snapshot: null }` if absent. Never throws to the client — a
  missing/failed read returns null so the UI falls back cleanly.
- No secret required (read-only, public leaderboard data); cache-control no-store.

## 8. UI merge & display

In `frontend/hooks/useLeaderboard.ts`:
- Keep reading on-chain `getLeaderboard`.
- Add a fetch of `/api/provisional?roundId=` (via react-query).
- Merge per player (match on lowercased address):
  - `displayScore = onChainScore + (prov?.todayScore ?? 0)`
  - `displayUniqueTo = onChainUniqueTo + (prov?.todayUniqueTo ?? 0)`
  - `displayStreak = prov?.streak ?? onChainStreak`  *(provisional streak is authoritative when present; else on-chain)*
- Re-sort by `displayStreak → displayScore → displayUniqueTo` (contract's order) and
  re-assign ranks + estimated prizes.
- Expose a `isProvisional` / `updatedAt` flag so the component can badge it.

In `frontend/components/Leaderboard.tsx`:
- When provisional data is present, show a small **"LIVE · updated Xm ago"** badge and keep
  the existing per-row "N pts" (now reflecting the merged Score).
- No layout overhaul — additive.

## 9. Fallbacks & edges

- **KV empty / stale / unset env** → `/api/provisional` returns null → UI shows the plain
  on-chain leaderboard. Zero hard dependency; the feature degrades to today's behavior.
- **Round-0 first day** → provisional step self-fetches (Section 2 edge).
- **Current in-flight round started pre-Phase-1** → its closed days may hold old
  (un-rate-capped) on-chain Scores. We anchor `displayScore` on on-chain confirmed and only
  ADD today, so we never contradict locked values; provisional is clean going forward.
- **Resolution** → untouched; final payout still from the on-chain post-round scan.
- **KV write failure in the cron** → caught and logged; submission path is unaffected.

## 10. Testing

- Unit: `computeProvisional` — provisional streak across an active run, a gap/reset, entry-day,
  no-activity; `todayScore`/`todayUniqueTo` rate-capped and loyalty-applied; snapshot shape.
- Unit: the merge/re-rank in `useLeaderboard` — additive Score/uniqueTo, provisional streak
  precedence, re-sort changes rank, fallback when provisional null.
- Route: `/api/provisional` returns snapshot when present, null when absent, never throws.
- Reuse existing scanner/loyalty suites; mock KV in tests (no live KV needed).

## 11. Out of scope

- No cron cadence change (stays 30 min).
- No per-user client-side live augmentation (rejected: hybrid complexity).
- No XP/levels/streak-freeze — Phase 2, though it reuses this KV store.
- No change to on-chain submission timing, ranking keys, or payout.
