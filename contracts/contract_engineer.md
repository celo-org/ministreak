# MiniStreak — Engineer Brief

Build the on-chain contracts for a weekly transaction-streak game on Celo. USDT entry fees, daily streak tracking via an off-chain oracle, top-3 prize split, auto-resolve, auto-refund.

## Game overview

Players pay 0.10 USDT to enter a weekly round. Each day during the round they must send any outgoing transaction (not a self-send) to keep their streak alive. An off-chain oracle scans player activity daily and submits streak proofs on-chain. At the end of the week the contract ranks players and distributes the pot to the top 3. If fewer than 3 players enter, every entry fee is refunded automatically.

## Game rules

| Rule | Value |
|---|---|
| Token | USDT (6 decimals) on Celo |
| Entry fee | 0.10 USDT |
| Round window | Monday 00:00 → Sunday 23:59 UTC (7 days) |
| Qualifying daily activity | Any outgoing tx (not self-send), credited once per UTC day by oracle |
| Streak math | +1 per consecutive day; reset to 1 on a skip |
| Ranking | streak desc → txCount desc → uniqueToCount desc |
| Min players for payout | 3 (else auto-refund) |
| Protocol fee | 5% of pot to treasury |
| Payout split (3 winners) | 50 / 30 / 20 |


## Contracts

Two-contract design recommended, but you may inline the oracle into the vault if you prefer a single deploy:
> Highly recommend you check out how the current contracts/game version works: [functionalities.md](./functionalities.md).

- **`MiniStreak`** — vault. Holds entries, tracks streaks, ranks, distributes payouts, refunds.
- **`StreakOracle`** — trusted-submitter bridge. Off-chain hot wallet calls this; it forwards to the vault.

USDT is held custodially in the vault between entry and resolve. Upon resolve: if players are >= 3, share prize to winners. If players < 3, refund to players wallets; no need for players to claim refund or prize.

