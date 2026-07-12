# MiniStreak — Fairness, Retention & Onboarding Design

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan
**Origin:** MiniPay team feedback — (1) nicer/clearer UI + onboarding, (2) a daily-return
reward on top of the game, (3) restrict tx-farming that games the tiebreakers,
(4) a loyalty multiplier for players who participated in previous rounds.

---

## 1. Guiding constraint

The vault (`MiniStreak.sol`) and oracle (`StreakOracle.sol`) are **deployed to Celo
mainnet and immutable**. `resolveRound` selects winners **only** from three on-chain
values, in order:

```
streak (primary)  →  txCount (secondary)  →  uniqueToCount (tertiary)
```

Pot economics (0.10 USDT entry → pot → 50/30/20 split, 5% fee, min 3 players) are fixed.

**Therefore the whole design is off-chain. No contract change, no redeploy, no re-audit,
no MiniPay resubmission.** Anything that must affect the money ranking is expressed through
the one value the off-chain scanner freely controls when it calls `recordStreak`: the
per-day `txCount` (and, alongside it, `uniqueToCount`). `streak` is computed on-chain from
consecutive day submissions and cannot be forged off-chain — only *preserved* (see
streak-freeze).

## 2. Model chosen: two layers

- **Money layer (competitive):** `streak → Score → uniqueTo`, where **Score** is a
  rate-capped, loyalty-weighted number submitted as the on-chain `txCount`. Kept "clean"
  so the payout ranking is defensible as fair.
- **Retention layer (persistent):** an off-chain **XP → Levels → perks** system with a
  **streak-freeze** as its marquee perk. It brings players back day-to-day and survives
  losing weeks. **It does not directly alter payout** — its only money-relevant effect is
  the streak-freeze *preserving* a streak the player actually earned.

Rejected: a single unified "everything is one Score that drives payout" model — it lets
XP/daily rewards bias real money and makes the daily reward feel hollow against a longer
streak. Rejected: a v2 contract — cost (audit, live-round migration, resubmission) with no
capability we can't reach off-chain.

## 3. Terminology change

`txCount` is relabeled **"Score"** everywhere in the UI. Once it is a rate-capped,
loyalty-weighted value, calling it "transactions" is misleading. The on-chain field name is
unchanged; only the UI label and mental model change.

---

## Phase 1 — Fairness: the Score engine (anti-farm + loyalty)

Resolves feedback #3 (anti-farm) and #4 (loyalty). Small, no new storage — loyalty is read
from chain. Ships first.

### 3.1 Score computation (per player, per day) — in `frontend/lib/oracle/scanner.ts`

1. Gather the day's outgoing txs (post-entry, non-self-send) — existing behavior.
2. **Rate-cap (anti-farm):** sort by timestamp; greedily count a tx only if it is
   **≥ `RATE_WINDOW_MIN` (default 30 min)** after the last *counted* tx. Result: at most
   **1 counted tx per 30 min** (≤ 48/day). The rate-cap *is* the cap — no separate daily cap.
3. `day_base = rate_capped_count`.
4. **Loyalty multiplier** (see 3.2) × `day_base`, rounded → `day_score`.
5. Submit `day_score` as that day's `txCount` contribution. The contract sums per-day
   submissions into the weekly Score automatically.

**uniqueToCount:** computed over the **same rate-capped counted set** — i.e. distinct
external recipients *among the counted txs*, not all of the day's txs. This keeps both
tiebreakers derived from one consistent set and closes the alt-spam hole on the tertiary
key. Honest users are unaffected (real sends spread across the day still count); only burst
alt-spam is trimmed.

### 3.2 Loyalty multiplier

Read on-chain whether the player entered prior rounds (`playerRecords(roundId - n, player).entered`):

| Prior participation | Multiplier |
|---|---|
| Did not enter last round | **1.0×** |
| Entered last round | **1.5×** |
| Entered 2+ consecutive prior rounds | **2.0×** (cap) |

Skipping a round resets the streak of participation to 1.0× next time. Multiplier is
constant for the round, so it scales each day's Score equally. All values are tunable config.

### 3.3 Required submission-timing change

The scanner currently submits the **current, in-progress day** (`scanPlayerToday`), and the
on-chain "submitted once" guard (`StreakOracle.submitted[round][player][day]`) locks whatever
count exists at first submission. Rate-capping a full day requires seeing the whole day
first, so:

- **Submit each day's Score just after the day closes**, not at first tx. This matches the
  recommendation already recorded in `docs/scaling.md`.
- **Pair with optimistic UI:** the streak card flips to "Today's in ✓" client-side the
  instant the player transacts, preserving the live feel despite on-chain finalization at
  day-close. On-chain streak/leaderboard update at day rollover (~just after UTC midnight),
  which the existing 3-min cron already handles.

### 3.4 What does NOT change

- The contract, the ranking order, the pot split.
- The streak rule (1+ qualifying tx/day). Rate-capping never threatens a streak — a streak
  needs only 1 tx/day; the cap only shapes Score.
- `streak` remains the dominant key: a longer streak always beats a shorter one regardless
  of Score, loyalty, or XP. Score/uniqueTo only break ties among equal streaks (the common
  real-money case at scale, per `scaling.md`).

---

## Phase 2 — Retention: XP → Levels → perks (+ streak-freeze)

Resolves feedback #2 (daily-return reward). Needs a persistent store. Ships second.

### 4.1 Storage

**Vercel KV (Redis).** Non-custodial — game metadata only, no funds. Store of record for
XP/levels/freeze tokens. Keyed by lowercased address. Requires a periodic backup snapshot.

Per-address record (shape, not final schema):
```
{ xp: number, freezeTokens: number, lastProcessed: { round, dayIndex },
  freezeLog: [{ round, dayIndex, at }] }
```
`level` is derived from `xp` via the curve (not stored). `lastProcessed` makes XP grants
idempotent; `freezeLog` makes freeze consumption survive cron retries.

### 4.2 XP and Levels

- **XP earning:** each day the oracle records a streak day for the player, award
  **+10 base + escalating same-week bonus** (day 2 of a run +2, day 3 +4, …). Persists
  across rounds. Idempotent via `lastProcessed` (a day already counted on-chain is never
  re-awarded).
- **Levels:** XP thresholds on a gentle curve. Level-ups unlock **streak-freeze tokens** at
  milestones and **cosmetic** leaderboard frames/badges.
- **Decision (locked):** level perks are **freeze-tokens + cosmetics only**. Levels do
  **not** add any money multiplier. Loyalty→money stays purely round-participation-based
  (Phase 1). This preserves the clean money layer.

### 4.3 Streak-freeze (marquee perk)

- **Earn:** granted at level milestones; banked as an integer token count in KV.
- **Auto-apply at day-close:** if the player had an active streak, missed a day, and holds
  ≥1 token → consume 1 and have the oracle submit a **"covered day"** for the missed
  `dayIndex` with `txCount = 0, uniqueToCount = 0`. This preserves the on-chain streak chain
  (contract increments `streak` because `dayIndex == lastValidDay + 1`) while adding **zero**
  Score/uniqueTo — so a freeze never inflates the money tiebreakers.
- **Feasibility:** the oracle hot wallet is the trusted submitter; the contract does not
  verify a tx existed, so a covered day is a legitimate oracle-enforced game rule.
- **Bounds:**
  - Cannot cover the current in-progress day — only a fully-missed past day, decided at
    day-close.
  - Cannot substitute for entry (player must have `entered`).
  - Limited by tokens held.
  - Must be submitted in day-order, before the next real day is submitted, or the contract
    resets the streak. The scanner processes days in order, so the freeze decision for day N
    happens when day N closes, ahead of day N+1's submission.

### 4.4 Trust model

XP and freeze tokens are computed **server-side from on-chain play history**, never
user-claimable arbitrarily. The freeze is the only retention element that touches a
money-relevant value (the streak), so its granting/consumption is fully oracle-controlled.
KV is authoritative for token balances; XP/levels are deterministically replayable from
on-chain history if needed.

### 4.5 Frontend surface

- `GET /api/profile?address=` → `{ xp, level, nextLevelAt, freezeTokens, badges }`.
- StreakCard gains: Level badge, freeze-token indicator, and a "2× loyal" badge when the
  loyalty multiplier is active.
- Celebratory daily-bonus toast on the day's XP grant.

---

## Phase 3 — Onboarding + Score/Level UI polish

Resolves feedback #1. Keeps the live editorial aesthetic — no restyle (the unshipped
arcade-pixel plan is not adopted here). Ships third.

- **First-run onboarding carousel:** gated by a `localStorage` `ms_onboarded` flag,
  skippable, and re-openable from the existing "How to play" section. **4 screens:**
  1. What MiniStreak is — a weekly streak game; win real USDT.
  2. How to play — pay 0.10 USDT to enter; do 1+ transaction every day.
  3. How you win — longest streak wins; ties broken by Score (rate-capped activity) then
     unique recipients; top-3 split the pot 50/30/20.
  4. Stay in it — streak-freeze, levels, and the loyalty multiplier for returning players.
- **Relabel** `txCount` → **"Score"** in the leaderboard and stats, with a tap tooltip:
  "rate-capped activity — spamming doesn't help."
- Clearer entry/empty states; Level and freeze-token surfaced on the streak card.

---

## 5. Cross-cutting

### 5.1 Data flow
```
oracle cron (end-of-day)
  → scanner: rate-capped Score + loyalty + uniqueTo (rate-capped set)
  → submitter: recordStreak(txCount = Score, uniqueToCount)      [on-chain]
  → KV update: XP/level, evaluate + apply streak-freeze          [Phase 2]
frontend
  → reads on-chain: streak, Score (txCount), uniqueTo
  → reads KV via /api/profile: xp, level, freezeTokens, badges   [Phase 2]
  → optimistic "Today's in" the moment the player transacts       [Phase 1]
```

### 5.2 Error handling
- Score/uniqueTo/XP recomputations are deterministic and idempotent: the on-chain
  once-only guard prevents double submission; the KV `lastProcessed` cursor prevents
  double XP; `freezeLog` makes freeze consumption safe under cron retries.
- End-of-day submission means a run that fires mid-day submits nothing for the current day
  (only closed days), which is the intended behavior.

### 5.3 Testing
- Unit: rate-cap greedy counter (bursts, exactly-30-min boundaries, empty day); loyalty
  tiers (0/1/2+ consecutive rounds, reset on skip); uniqueTo over rate-capped set; XP/level
  curve and idempotent grants; freeze auto-apply (happy path, ordering, "can't cover current
  day", no tokens, not-entered).
- Extend the existing `scanner.test.ts` / `submitter.test.ts` suites; add tests for the KV
  profile layer and `/api/profile`.

### 5.4 Tunable config (defaults)
| Knob | Default |
|---|---|
| `RATE_WINDOW_MIN` | 30 min (1 counted tx per window) |
| Loyalty tiers | 1.0× / 1.5× / 2.0× (cap) |
| XP per active day | +10 base + escalating same-week bonus |
| Level curve | gentle; milestones grant freeze tokens |
| Onboarding screens | 4 |

---

## 6. Phasing & sequencing

1. **Phase 1 — Fairness** (anti-farm rate-cap + loyalty + end-of-day submission + optimistic
   UI + Score relabel). Smallest; directly answers the fairness complaint; no new storage.
2. **Phase 2 — Retention** (Vercel KV, XP/levels, streak-freeze, `/api/profile`, StreakCard
   surface).
3. **Phase 3 — Onboarding** (first-run carousel, tooltip, polished entry/empty states).

Each phase is independently shippable and independently valuable. No phase requires a
contract change.

## 7. Open items to confirm during planning
- Exact XP curve numbers and level→freeze milestone table.
- Vercel KV vs Postgres final choice and backup cadence.
- Copy for the 4 onboarding screens.
