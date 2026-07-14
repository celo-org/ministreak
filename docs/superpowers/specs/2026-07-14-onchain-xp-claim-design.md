# On-chain Claimable Daily XP — Design Spec

**Date:** 2026-07-14
**Status:** Approved design (pending user review) → implementation plan to follow

## Goal

Replace the off-chain, oracle-awarded daily XP with an **on-chain, player-claimed** XP
ledger. A player visits, sees **"Claim today's XP"**, and claims it in one on-chain
transaction. That transaction doubles as the day's streak activity. XP's downstream
usage (levels, freeze-token grants) is unchanged.

## Motivation

- **Live feel:** today XP is granted by the oracle only *after* the day closes at
  midnight UTC, so a player's XP lags by up to a day. A claim is **instant** — the
  strongest reason for this change.
- **On-theme:** the game exists to drive on-chain activity; the claim is itself a real
  on-chain tx, and it satisfies the daily streak requirement (any outgoing tx counts).
- **Simpler oracle:** the oracle stops awarding XP entirely.

## Scope

**In scope:** a new `StreakXP` contract; a `useClaimXp` hook; reworking the Home "Daily
XP" card into a claim surface; reading XP from chain; removing `awardXp` from the oracle
and re-sourcing freeze grants from on-chain XP; deploy + wiring + tests.

**Non-goals (this iteration):**
- Moving freeze tokens fully on-chain (they stay KV-managed; see Deferred).
- Migrating existing XP — **fresh start for everyone** (decided). On-chain XP starts at
  zero for all wallets; existing off-chain XP, levels, and earned freeze tokens are
  discarded at cutover. Announce to the community.
- Changing the pot ranking (streak → Score → uniqueTo) — untouched. XP carries **zero**
  economic weight, so the claim can't buy pot advantage.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Claim vs streak | The claim is one valid qualifying tx among others. Any outgoing tx still makes the day count; the claim is simply an outgoing tx, so **no scanner change**. |
| XP amount | **Flat per day** (default 10), owner-settable. No streak scaling → self-contained contract. |
| Migration | **Fresh start** — no seeding. |
| Claim eligibility | **Gated to entered players** — must be entered in the current round to claim. |
| Freeze tokens | Stay **KV-managed** (oracle grants + spends); only the grant *trigger* re-sources from on-chain XP. |
| Attribution | `claimDaily` carries the **ERC-8021** builder-code suffix (frontend `dataSuffix`), like enter/approve/refund. |
| XP token shape | **Soulbound counter** (a `mapping`), not a transferable ERC-20. |

---

## Component A — `contracts/src/StreakXP.sol` (new, soulbound)

A minimal soulbound XP ledger. No transfer/approve surface — XP is a non-transferable
counter, so it cannot be bought.

**Interface it depends on** (the deployed MiniStreak vault):

```solidity
interface IMiniStreak {
    function currentRoundId() external view returns (uint256);
    function getPlayerStats(uint256 roundId, address player)
        external view
        returns (uint8 streak, uint32 txCount, uint16 uniqueToCount,
                 uint8 lastValidDay, bool claimed, bool entered);
}
```

**State**
- `IMiniStreak public immutable vault;` — set in constructor.
- `uint256 public dailyXp;` — default `10`, owner-settable via `setDailyXp`.
- `mapping(address => uint256) public xp;` — cumulative XP per player.
- `mapping(address => uint32) public lastClaimDay;` — last claimed UTC day index.
- Ownable (OpenZeppelin) for `setDailyXp` and `transferOwnership`.

**`claimDaily()`** (external)
1. `uint256 roundId = vault.currentRoundId();`
2. `(, , , , , bool entered) = vault.getPlayerStats(roundId, msg.sender);`
   `require(entered, NotEntered())`.
3. `uint32 today = uint32(block.timestamp / 1 days);` — rolls at 00:00 UTC, matching the
   game's midnight-UTC day boundary.
4. `require(lastClaimDay[msg.sender] < today, AlreadyClaimedToday())`.
   **This is a per-calendar-day reset, NOT a rolling 24h cooldown.** Eligibility depends
   only on the UTC day, never on how long ago the player last claimed: a player who
   claims at 23:59 UTC can claim again at 00:00 UTC (~1 min later) because `today`
   incremented. One claim per UTC calendar day; the clock is the day, not the player.
5. `lastClaimDay[msg.sender] = today; xp[msg.sender] += dailyXp;`
6. `emit Claimed(msg.sender, today, dailyXp, xp[msg.sender]);`

**Views**
- `xpOf(address) → uint256` (or just the public `xp` getter).
- `canClaim(address player) → bool` — `true` iff entered in `currentRoundId` **and**
  `lastClaimDay[player] < block.timestamp / 1 days`. Lets the UI show/enable the button
  without a wallet round-trip.

**Events**
- `event Claimed(address indexed player, uint32 indexed dayIndex, uint256 amount, uint256 newTotal);`

**Errors**
- `NotEntered()`, `AlreadyClaimedToday()`.

**Access:** anyone entered may claim; only owner may `setDailyXp`. No role needed for the
oracle (the oracle only *reads* `xp`).

**Notes**
- `viaIR: true` already required by the repo's hardhat config; StreakXP is simple and
  compiles either way.
- Celo legacy-tx / fee-currency behavior is identical to `enterRound` (gas payable in a
  fee currency inside MiniPay).

## Component B — ERC-8021 attribution

No contract change. The frontend already appends the builder-code suffix via viem's
`dataSuffix` (see `hooks/useEnterRound.ts`, using `BUILDER_SUFFIX` from
`lib/builderCode.ts`). `useClaimXp`'s `writeContract` call passes the same
`dataSuffix: BUILDER_SUFFIX`, so claims are attributed to MiniStreak in Celo's
builder-attribution dashboard.

## Component C — Frontend

**New constants (`frontend/lib/contracts.ts`)**
- `XP_ADDRESS` from `NEXT_PUBLIC_XP_ADDRESS` (same env pattern as `VAULT_ADDRESS`).
- `XP_ABI` — `claimDaily()`, `xp(address)`, `lastClaimDay(address)`, `canClaim(address)`,
  `dailyXp()`, the `Claimed` event.

**New hook `frontend/hooks/useClaimXp.ts`** — mirrors `useEnterRound`:
- `claim()` → legacy-mode `writeContract({ ..., functionName: "claimDaily", dataSuffix: BUILDER_SUFFIX })`
  with the same gas-price buffer + `getWalletClient(config)` MiniPay-auto-connect handling.
- Steps: `idle → claiming → done | error`; exposes `step`, `txHash`, `error`, `reset`.
- On `done`, callers refetch the XP read (optimistic +dailyXp for instant feel).

**New read hook `frontend/hooks/useXp.ts`** (or fold into `useProfile`):
- `useReadContract` on `XP_ADDRESS`:
  - `xp(address)` → total XP,
  - `canClaim(address)` → whether today's claim is available,
- Derive `level / xpIntoLevel / xpForNextLevel` client-side via the existing
  `lib/xp.ts` `xpProgress` / `levelForXp` (unchanged formulas).
- `refetchInterval: 60_000` for freshness after cross-device claims.

**`frontend/hooks/useProfile.ts`** — `ProfileView` becomes:
- `xp`, `level`, `xpIntoLevel`, `xpForNextLevel` → from the on-chain read (Component C).
- `freezeTokens` → still from `/api/profile` (KV).
The hook composes both sources; consumers (`/me`, `StreakCard`) keep the same shape.

**Home "Daily XP" card (`frontend/app/page.tsx`)** becomes the claim surface:
- Gated to entered players (same condition as the existing Daily XP block:
  `isConnected && stats?.entered`).
- If `canClaim`: primary button **"Claim today's XP · +{dailyXp}"** → `useClaimXp.claim()`.
  Claiming state → "Claiming…"; on done → **"Claimed +{dailyXp} today"** with the green
  check, disabled until next UTC day.
- If already claimed today: the claimed state above.
- Keep the 7-dot week strip, now marking **days claimed this week** (derive from
  `Claimed` events or a simple per-day read; display-only). Drop the streak-scaled
  `+10/+15/…` ladder (XP is flat now).
- Keep the green accent bar and the one-line helper, reworded to "Claim your XP each day."

**`/me` (`frontend/app/me/page.tsx`)** — unchanged layout; XP/level now flow from the
on-chain read via `useProfile`. Score and streak stay on-chain vault reads as today.

## Component D — Oracle & profile

**`frontend/lib/oracle/run.ts`**
- Remove the `awardXp(qualifying, round)` call — XP is no longer oracle-granted.
- Add a **freeze-grant pass** (replaces the freeze side-effect that lived in `awardXp`):
  for the round's players, read on-chain `xp` in one multicall (like the existing
  `checkAlreadySubmitted` multicall), compute `level = levelForXp(xp)`, and call
  `grantFreezes(...)` to update KV `freezeTokens` / `lastFreezeMilestone`. Non-fatal.

**`frontend/lib/oracle/profileStore.ts`**
- `awardXp` is removed.
- `Profile` (KV) shrinks to freeze state only:
  `{ freezeTokens: number; lastFreezeMilestone: number; freezeUsedRound: number | null }`
  (drop `xp` and `cursor` — XP lives on-chain, and the XP-idempotency cursor is gone).
- Add `grantFreezesFor(address, level)` used by the run.ts pass; keep `readProfile` /
  `writeProfile`.

**`frontend/app/api/profile/route.ts`**
- Returns `{ profile: { freezeTokens } | null }` only (XP dropped from this route; it is
  read on-chain by the client). `xpProgress` derivation moves fully client-side.

**Freeze spend** (`frontend/lib/oracle/freeze.ts`) is unchanged — it still reads KV
`freezeTokens` and bridges a missed day. Only the *grant source* changed.

## Data flow (claim → streak → display)

1. Player taps **Claim today's XP** → `claimDaily()` tx (with ERC-8021 suffix).
2. Contract: verifies entered in `currentRoundId`, not-yet-claimed today → `xp += dailyXp`.
3. UI: optimistic `xp += dailyXp`, `canClaim = false` → instant "Claimed +N today".
4. The claim is an outgoing tx → the oracle's next scan counts it as **today's streak
   activity** (no scanner change). "Today's in · confirming" flips via the existing
   `useTodayActivity` poll (~1 min).
5. On-chain streak / Score still finalize post-midnight via the oracle's closed-day
   submission — unchanged.

## Error handling / edge cases

- **Not entered:** `canClaim` is false and the button is hidden/replaced by the existing
  "enter this week" flow; a direct call reverts `NotEntered()`.
- **Double claim same day:** contract reverts `AlreadyClaimedToday()`; UI disables the
  button after a successful claim until the next UTC day.
- **Between rounds:** `currentRoundId` advances; a player must enter the new round before
  they can claim again (intended, matches the entry gate).
- **Gas / wallet:** same handling as `useEnterRound` (gas-price buffer, on-demand
  `getWalletClient`, legacy tx).
- **Contract unreachable / wrong network:** reads fail closed (`canClaim=false`), button
  hidden — no false "claimable" state.

## Testing

- **Contract (`contracts/test/StreakXP.test.ts`):** claim grants `dailyXp`; second claim
  same day reverts; claim on a new UTC day succeeds; non-entered wallet reverts
  `NotEntered()`; `canClaim` reflects entered + day state; `setDailyXp` owner-only; XP is
  non-transferable (no transfer surface).
- **Frontend:** `useClaimXp` step machine (idle→claiming→done/error) with mocked wallet;
  `useProfile` composing on-chain XP + KV freeze; Home card renders claim vs claimed vs
  not-entered; `dataSuffix` passed on the claim call.
- **Oracle:** `run.ts` no longer calls `awardXp`; the freeze-grant pass grants at level
  milestones from on-chain XP; `profileStore` freeze-only shape.

## Deploy / cutover

- `contracts/scripts/deploy.ts`: after the vault + oracle, deploy `StreakXP(vault)`; save
  its address to `contracts/deployments/celo.json` and `contracts/constants.ts`
  `DEPLOYED_ADDRESSES`.
- `contracts/scripts/verify.ts`: add StreakXP verification.
- Set `NEXT_PUBLIC_XP_ADDRESS` in Vercel (build-time inlined — rebuild after).
- Fresh start: no KV migration; existing KV profiles can be left (freeze state re-derives)
  or cleared.

## Deferred (future iterations)

- Move freeze tokens fully on-chain (grant + spend), making all retention state
  trustless; requires an oracle spend-role and a bigger contract.
- Streak-scaled XP (needs an on-chain streak source or an in-contract claim-streak).
- Wallet-visible XP (a soulbound ERC-20-style balance) if desired for composability.
