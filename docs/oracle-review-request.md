# Oracle Architecture Review — MiniStreak

## What we're asking

We're about to send MiniStreak to audit and launch on Celo with real user funds in a vault. Before we spend audit budget, we want an architectural verdict on the oracle pattern below: **is this defensible for a fund-custody protocol, or is it a non-starter regardless of hardening?**

We are not asking for a line-by-line review. We want: (a) yes / no / "yes if", (b) the minimum hardening you'd require pre-audit, and (c) any redesign you'd recommend within a tight budget.

## What MiniStreak does

- 7-day rounds. Players deposit **0.10 USDT** into a vault to enter.
- Each day, players are scored on (1) consecutive-day streak, (2) total qualifying tx count, (3) unique recipient count.
- At round end, top 3 split the pot **50 / 30 / 20** after a 5% protocol fee.
- Stack: Solidity on Celo, USDT-denominated vault, off-chain Node oracle.

## Current architecture

- **`contracts/src/MiniStreak.sol`** — vault. Custodies USDT, tracks per-player streak / tx / unique-recipient counts. `recordStreak(...)` is gated by `ORACLE_ROLE`. `resolveRound()` ranks top 3 and pays out — **admin-only**.
- **`contracts/src/StreakOracle.sol`** — attestation relay. A single `trustedSubmitter` EOA may call `submitStreak(player, roundId, dayIndex, txCount, uniqueToCount)`. One submission per `(player, round, day)`. Forwards into the vault's `recordStreak`. Trust is "caller address equals stored submitter" — no signature verification on the payload.
- **`oracle-service/`** — Node service, hourly cron. For each registered player, scans **Blockscout's API** for outgoing txs in the current UTC day window, counts txs and unique recipients, signs with `ORACLE_PRIVATE_KEY` (single hot wallet), submits one tx per qualifying player.

## Risks we already see

- **Single hot key = single point of compromise.** Whoever holds `ORACLE_PRIVATE_KEY` can fabricate `txCount` / `uniqueToCount` for any registered player and rank-game the payout. Nothing on-chain ties an attestation to a real Celo tx hash.
- **Liveness / censorship.** If the service is down or the key is lost, no streaks land — entry fees are stuck until admin intervenes; round cannot resolve fairly.
- **External data dependency.** Daily activity is read from Blockscout. Outage, rate-limit, or pagination bug → players who *did* transact get scored zero.
- **Admin-gated settlement.** `resolveRound()` is admin-only. The pot sits in the vault until admin acts; no permissionless fallback.
- **No dispute window.** Once `recordStreak` lands, it is final. A bad attestation cannot be reverted before payout.
- **No signed attestations.** The vault trusts the caller blindly. If `setTrustedSubmitter` is ever misset by the owner, anything goes.

## Questions

1. Is a single hot-wallet attestor acceptable for a custodial prize pot of this shape, or is it a non-starter regardless of hardening?
2. If we keep the pattern, what's the minimum acceptable hardening pre-audit? Multisig submitter? EIP-712 signed attestations verified on-chain? Dispute / challenge window before `resolveRound`? Commit-reveal?
3. Is there a better scoring source on Celo that removes Blockscout from the trust path — subgraph, on-chain accumulator, or user-submitted proof-of-tx-inclusion?
4. Should `resolveRound()` be permissionless and time-gated instead of admin-only?
5. Anything in the current design that would make you refuse to audit it as-is?

## Constraints

A fully trustless redesign is out of scope for this launch. We're looking for the **minimum viable design that is safe enough to hold real user funds**, not the theoretical ideal.
