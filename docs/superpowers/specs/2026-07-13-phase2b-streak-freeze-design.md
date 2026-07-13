# Phase 2b — Streak-Freeze Design

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Origin:** Phase 2b of the retention layer — the marquee perk. The only part that **writes
on-chain** (and the only part that touches the money-affecting streak), so it ships behind a
kill-switch and gets heavy tests on its pure decision logic. Builds directly on Phase 2a's
XP/level profile.

---

## 1. What it is & constraints

A **streak-freeze** lets a player miss one day without losing their streak. It is implemented
entirely by the **off-chain oracle** — **no contract change**:

- `recordStreak` increments the streak when `dayIndex == lastValidDay + 1` and adds
  `txCount`/`uniqueTo`. So the oracle bridging a missed day = submitting a **covered entry**
  `{player, missedDay, txCount: 0, uniqueToCount: 0}` through the **existing**
  `batchSubmitStreaks` path (signed by the oracle hot wallet). This preserves the streak and
  adds **zero Score**.
- **No change** to ranking, submission timing, payout, or the contract. Reuses the Phase 2a KV
  profile and the `run.ts` cron.

**Locked rules (scarce & precious):** auto-apply (no "use freeze" button); earn 1 token per 3
levels; hold at most 2; ≤1 freeze used per round; only a **single** missed day can be bridged
(no 2+ consecutive); a freeze can't substitute for entry. **Cover-on-return** trigger.

## 2. Earning (extends Phase 2a `Profile`)

`Profile` gains three fields (all default to the "none" value for existing profiles):

```ts
interface Profile {
  xp: number;
  cursor: { round: number; day: number } | null;
  freezeTokens: number;           // held, capped at 2
  lastFreezeMilestone: number;    // highest level-milestone already granted (multiple of 3)
  freezeUsedRound: number | null; // round in which a freeze was last spent (≤1/round)
}
```

**Grant** happens inside `awardXp` after XP updates the level (pure helper `grantFreezes`):
- `milestone = Math.floor(level / 3) * 3` (0, 3, 6, 9, …).
- New tokens = number of multiples of 3 in `(lastFreezeMilestone, milestone]`, i.e.
  `(milestone − lastFreezeMilestone) / 3`.
- Grant `min(newTokens, FREEZE_CAP − freezeTokens)` (forfeit any beyond the cap of 2), then set
  `lastFreezeMilestone = milestone`. Idempotent — re-processing grants nothing.
- Tokens come only from XP, which comes only from real active days → not user-forgeable.

`FREEZE_CAP = 2` (tunable config).

## 3. Spending — cover-on-return (the on-chain part)

Runs each scan **after** `awardXp`, gated by `FREEZE_ENABLED`. Uses each player's on-chain
`lastValidDay` (one multicall) plus the scan's active closed days.

**Pure decision** `decideFreezeCover({ lastValidDay, activeClosedDays, freezeTokens, freezeUsedRound, currentRound }) → coverDay | null`:
- Return `null` unless `freezeTokens ≥ 1` **and** `freezeUsedRound !== currentRound` **and**
  `lastValidDay` is a real day (0–6, not the 255 sentinel).
- `returnDay R` = the smallest active closed day `> lastValidDay`. If none → `null` (not
  returning yet — a trailing streak isn't reset until they come back, so nothing to save).
- If `R − lastValidDay === 2` (exactly one missed day at `lastValidDay + 1`, which has no
  activity entry) → cover `lastValidDay + 1`. Otherwise `null` (gap of 1 = consecutive, no
  miss; gap ≥ 3 = 2+ missed days, not coverable).

**Applying a cover** (in `run.ts`):
- Build a synthetic entry `{ player, roundId, dayIndex: coverDay, txCount: 0, uniqueToCount: 0 }`
  and merge it into the submission set alongside the real closed-day `qualifying` entries.
- Consume: `writeProfile(player, { …profile, freezeTokens: freezeTokens − 1, freezeUsedRound: currentRound })`.
- **Sort the final submission batch by `(player, dayIndex)` ascending** before submitting, so a
  covered day always precedes the return day for that player. The contract requires the covered
  day `L+1` to land before the return day `R` (else `R` resets the streak). This also hardens the
  existing implicit ordering.

**Why cover-on-return is correct & timely:** a trailing streak only resets when a later day is
submitted after a gap. The freeze is applied in the **same scan that first submits the return
day** (before it lands on-chain), so the covered day and return day go in one ordered batch. A
player who simply stops never triggers a cover (their streak isn't at risk) — so tokens are
never wasted.

## 4. On-chain read

`getLastValidDays(publicClient, vaultAddress, roundId, players) → Map<lowercased address, number>`
— one viem multicall of `getPlayerStats(roundId, player)` (the `lastValidDay` field). Efficient
(O(1) calls in player count), same pattern as `checkAlreadySubmitted`.

## 5. Feature flag

`FREEZE_ENABLED` (env). **Default ON** — enabled unless `process.env.FREEZE_ENABLED === "false"`.
- When disabled, the cover step is skipped entirely (no on-chain covered-day writes); earning/
  granting still runs (harmless, off-chain).
- Kept as an instant kill-switch for the one on-chain-writing behavior (toggle in the Vercel
  dashboard, no redeploy).

## 6. UI (minimal)

- `/api/profile` also returns `freezeTokens`.
- StreakCard shows a freeze indicator (e.g. a shield glyph + count, "🛡 ×2"); hidden at 0.
- A celebratory "streak saved" toast is **deferred** (it needs client-side detection that a cover
  happened) — out of scope for v1; the token count is enough.

## 7. Safety

- No contract change; covered day adds zero Score; the money ranking still comes from the same
  on-chain keys.
- Blast radius of a detection bug is bounded and non-financial: at worst a returning player gets
  an undeserved one-day streak save, costing them a token — no funds move.
- The two decision surfaces (`grantFreezes`, `decideFreezeCover`) are **pure and heavily
  unit-tested**; the on-chain apply is thin glue.
- `FREEZE_ENABLED` default-on with a natural runway (no token until Level 3 ≈ weeks of play), so
  no covered-day write fires immediately on deploy; instant kill-switch remains.
- Reuses the Phase 2a KV store — dormant until KV is provisioned (already done).

## 8. Testing

- Pure: `grantFreezes` (crossing L3/L6, cap-forfeit, idempotent, no-milestone); `decideFreezeCover`
  (returning after 1-day gap → cover; consecutive/no-gap → null; 2+ day gap → null; no token →
  null; already used this round → null; not returned yet → null; 255 sentinel → null).
- `getLastValidDays` multicall (mocked client).
- `run.ts`: cover injected + batch sorted (covered before return) + token consumed + `freezeUsedRound`
  set; `FREEZE_ENABLED=false` → no cover; non-fatal.
- Route/UI: `freezeTokens` surfaced; StreakCard shield shown when > 0, hidden at 0.

## 9. Out of scope

- Manual "use freeze" button; multi-day / consecutive freezes; the "streak saved" toast;
  cosmetic frames. Phase 3 (onboarding) is separate.
