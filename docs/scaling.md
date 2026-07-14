# Scaling Notes

Things to revisit as MiniStreak grows. Not needed at the current (small) player
base — captured here so the analysis isn't lost.

---

## 🚩 Rearchitect the streak oracle scanner — do this when approaching ~1,000 daily players

**Trigger:** revisit before ~1k daily active players (well ahead of the 10k target).

### The problem
The oracle scanner (`frontend/lib/oracle/scanner.ts`) is **O(players) explorer API
calls per run**: every cron run, for *every* player in the round, it fetches that
player's tx history from Blockscout **and** Etherscan (`scanAllPlayers` maps over
all `getRoundPlayers`, each doing `fetchOutgoingTxsSince`).

This does **not** scale:

- **Daily volume:** 10k players × 480 runs/day (at 3-min cadence) ≈ **4.8M explorer
  calls/day**. Etherscan free tier is 100k/day; even top paid tiers don't clear it.
- **Per-run burst:** each run fires ~10k concurrent calls. To finish inside the
  60s function limit you'd need ~167 req/s, far above any Etherscan tier (5–30
  req/s) — the function times out having scanned only a fraction of players, and
  Blockscout returns mass 429s.
- Conclusion: the per-player scan breaks somewhere around a **few hundred–1k
  players**, regardless of cron cadence or API tier. Gas is *not* the constraint;
  the explorer-per-player pattern is.

### The fix: block-based scanning (O(blocks), not O(players))
Scan what's *new on-chain* and filter by the player set, instead of interrogating
each player:

- Each run, fetch the blocks produced since a stored cursor (~180 blocks per 3-min
  on Celo's ~1s blocks), pull their transactions, keep the ones where
  `tx.from ∈ playerSet` (an in-memory set — O(1) per tx).
- **~180 calls/run ≈ 86k calls/day, independent of player count** — same cost for
  10 players or 100k.

Note: a cheap trick like reading **nonce deltas** is *insufficient* — the game
excludes self-sends and needs unique-recipient counts, which require actual per-tx
data (from/to). So we genuinely need tx data, just sourced by block.

### Chosen infrastructure direction (decided 2026-07-03)
**Vercel-only + a small managed store.** Keep scanning in the Vercel cron; add:
- **Vercel KV / Postgres** for the block **cursor** (last-scanned block) and a
  **per-(player, day) accumulator** (txCount + unique recipients).
- A **paid RPC** (forno is public and will rate-limit heavy block reads).

Rejected alternatives: a dedicated always-on indexer (Ponder/Subsquid) — more
robust but a new service to operate; a The Graph subgraph — reintroduces the
subgraph dependency we removed and indexes raw address-tx-history awkwardly.

### ⚠️ Open design decision to resolve first: submit timing vs tiebreaker accuracy
The **immutable contract allows each (player, day) streak to be submitted only
once** (`StreakOracle.submitted[round][player][day]` + vault `lastValidDay` both
guard it). So we cannot record a day's streak early and then top up its
`txCount`/`uniqueToCount` later. That forces a choice:

- **Submit after the day completes (accurate tiebreakers):** accumulate the full
  day's counts in KV, submit once the day is over → exact `txCount`/`uniqueToCount`
  → fair top-3. But on-chain streak/leaderboard lag up to ~24h, so pair with
  **optimistic UI** (card flips to "Today's in" the instant the player transacts)
  for the live feel.
- **Submit on first tx of the day (live on-chain):** submit within ~3 min of the
  player's first qualifying tx → live streak/leaderboard, but tiebreakers collapse
  to roughly "1 per active day," making top-3 among many 7-streak players largely
  arbitrary. (This matches today's behavior.)

Why it matters at scale: with 10k players, many hit the max 7-day streak, so
`txCount → uniqueToCount` decide the real-money top-3. Accurate tiebreakers likely
win → lean toward "submit after day completes + optimistic UI." Confirm before
building.

### Cheap win available anytime, independent of the above
**Optimistic UI:** flip the streak card to "Today's in" the moment the player fires
their tx (client-side), before the cron records it. Instant perceived
responsiveness with zero backend/API/gas cost, at any player scale.

### Current interim state
- Oracle cron at **every 3 min** (`frontend/vercel.json`), per-player scan.
- Dual-source (Blockscout + Etherscan union) so a single explorer gap doesn't drop
  a streak (`ETHERSCAN_API_KEY` in Vercel).
- These are fine for now; the rearchitecture is the thing to build at ~1k players.
