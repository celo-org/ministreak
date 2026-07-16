# Scaling Notes

Things to revisit as MiniStreak grows. Fine at the current (small) player base —
captured here so the analysis isn't lost.

**Bottom line:** the app is comfortable in the **low hundreds** of active/concurrent
players. It starts degrading (scanner timeouts, KV free-tier exhaustion, RPC/explorer
throttling) in the **few-hundred-to-1k** range, and **cannot handle ~10k at once**
without the rework below. "10k users at once" stresses two different axes — **round
size** (how many players the oracle must scan + the leaderboard must rank) and
**concurrency** (how many browsers are polling reads). The ranking below weighs both
by *what breaks earliest* and *blast radius*.

---

## Ranked priorities (most → least impactful)

| # | Improvement | Why it ranks here |
|---|---|---|
| 1 | **Block-based oracle scanner** (O(blocks), not O(players)) | Write side. Breaks earliest (~few hundred–1k players); without it, streaks stop being recorded — the game's core fails. |
| 2 | **Edge-cached shared read layer** (kill per-client fan-out) | The "at once" concurrency wall. 10k browsers each polling KV/Blockscout/RPC directly melts free tiers at *hundreds* of concurrent users. |
| 3 | **Bound `getLeaderboard`** (top-N on-chain, or rank off-chain) | The core view can't even be `eth_call`-read at high N (O(N²) sort). Breaks around several-k players. |
| 4 | **Trim the provisional payload** (top-N + viewer's own row) | Bandwidth + KV value size; ships all players to every client today. Pairs with #2. |
| 5 | **Paid infra tiers** (dedicated RPC + paid KV/Postgres) | Enabler for #1–#4; public forno + Upstash Free throttle under real load. |
| 6 | **Submission gas / batching strategy** | Real but lowest — Celo gas is cheap and already batched. |

---

## 1. 🚩 Rearchitect the streak oracle scanner — O(players) → O(blocks)

**Trigger:** before ~1k daily active players (well ahead of the 10k target). This is
the first hard wall and blocks everything downstream.

### The problem
The oracle scanner (`frontend/lib/oracle/scanner.ts`) is **O(players) explorer API
calls per run**: every cron run, for *every* player in the round, it fetches that
player's tx history from Blockscout **and** Etherscan (`scanAllPlayers` maps over all
`getRoundPlayers`, each doing `fetchOutgoingTxsSince`).

This does **not** scale:

- **Daily volume:** 10k players × ~144 runs/day (at the current 10-min cadence) ≈
  **1.4M explorer calls/day** (≈ 4.8M/day at 3-min). Etherscan free tier is 100k/day;
  even top paid tiers strain.
- **Per-run burst:** each run fires ~10k concurrent calls. To finish inside the 60s
  function limit you'd need >160 req/s, far above any Etherscan tier (5–30 req/s) — the
  function times out having scanned only a fraction of players, and Blockscout returns
  mass 429s.
- Conclusion: the per-player scan breaks somewhere around a **few hundred–1k players**,
  regardless of cron cadence or API tier. Gas is *not* the constraint; the
  explorer-per-player pattern is.

### The fix: block-based scanning
Scan what's *new on-chain* and filter by the player set, instead of interrogating each
player:

- Each run, fetch the blocks produced since a stored cursor (~600 blocks per 10-min on
  Celo's ~1s blocks), pull their transactions, keep the ones where `tx.from ∈ playerSet`
  (an in-memory set — O(1) per tx).
- **~600 calls/run ≈ 86k calls/day, independent of player count** — same cost for 10
  players or 100k.

Note: a cheap trick like reading **nonce deltas** is *insufficient* — the game excludes
self-sends and needs unique-recipient counts, which require actual per-tx data
(from/to). So we genuinely need tx data, just sourced by block.

### Chosen infrastructure direction (decided 2026-07-03)
**Vercel cron + a small managed store.** Add:
- **KV / Postgres** for the block **cursor** (last-scanned block) and a
  **per-(player, day) accumulator** (txCount + unique recipients).
- A **paid RPC** (forno is public and will rate-limit heavy block reads) — see #5.

Rejected: a dedicated always-on indexer (Ponder/Subsquid) — more robust but a new
service to operate; a The Graph subgraph — reintroduces the dependency we removed.

### ⚠️ Design decision to resolve first: submit timing vs tiebreaker accuracy
The **immutable contract allows each (player, day) streak to be submitted only once**
(`StreakOracle.submitted[round][player][day]` + vault `lastValidDay` guard it). We
cannot record a day's streak early and top up its `txCount`/`uniqueToCount` later.
That forces a choice:

- **Submit after the day completes (accurate tiebreakers):** accumulate the full day's
  counts, submit once the day is over → exact `txCount`/`uniqueToCount` → fair top-3.
  On-chain streak/leaderboard lag up to ~24h, so pair with the **optimistic UI**
  (already shipped) for the live feel. **This is the current behavior** (closed-day
  submission + optimistic display) — keep it.
- **Submit on first tx of the day (live on-chain):** live streak, but tiebreakers
  collapse to ~"1 per active day," making top-3 among many 7-streak players arbitrary.

At 10k players many hit the 7-day max, so `txCount → uniqueToCount` decide the
real-money top-3 → accurate tiebreakers win → stay with "submit after day completes +
optimistic UI."

---

## 2. Edge-cached shared read layer (kill per-client fan-out)

**Trigger:** hundreds of *concurrent* users — this is the "at once" killer, and it can
bite before #1.

### The problem
Every browser polls independently, ~every 60s:
- **`/api/provisional`** → one KV read each. 10k users ≈ **167 req/s ≈ 14M KV reads/day**.
  Upstash is **Free (500k commands/month)** → exhausted in ~1 hour. Even ~500 concurrent
  users (≈ 720k reads/day) blow the monthly cap in under a day.
  - Note: today's `fetchCache = "force-no-store"` fix (needed for freshness — it fixed
    the frozen-Data-Cache bug) means there is **no cache between clients and KV**, so it's
    one KV hit per request. Correct at small scale; expensive at large scale.
- **`useTodayActivity`** hits **Blockscout directly from every client** — 10k ≈ 167 req/s
  → Blockscout 429s.
- **RPC reads** (`getLeaderboard`, `xp`, `playerStats`, round data via wagmi) all go to
  **public forno** → throttled under load.

### The fix
Serve the shared reads from **one server-side, short-edge-cached** copy instead of one
per client:
- Cache `/api/provisional` (and a server-computed leaderboard) at the edge with a short
  `revalidate` (~10–20s) so it's fresh-enough but a single KV/RPC read is shared across
  all viewers, not one per request. (Replaces per-request `no-store` for these public,
  identical-for-everyone reads.)
- Move "today's activity" to a **server** endpoint (from the block-based accumulator in
  #1) instead of per-client Blockscout polling; the client's own optimistic bump can
  stay client-side but shouldn't hammer Blockscout at scale.
- Route wagmi RPC reads through a **paid RPC** (#5) and/or cache the round/leaderboard
  reads server-side.

---

## 3. Bound `getLeaderboard` (O(N²) on-chain)

**Trigger:** several-thousand players in one round.

### The problem
`MiniStreak.getLeaderboard` performs an **insertion sort over all round players**
(nested loop → O(N²)). At 10k that's ~100M iterations in a single `eth_call`, which
would exceed the node's call-gas cap and **time out / revert** — so the leaderboard
can't even be *read* at that size.

### The fix
- Maintain a **bounded top-N on-chain** (e.g. keep only the running top ~50 sorted on
  each `recordStreak`), so `getLeaderboard` is O(N) or O(1) to read; **or**
- Move ranking **off-chain** entirely (compute from the accumulator/provisional store)
  and keep on-chain state to raw per-player counts, reading the top-N for the UI.

Either way, don't return or sort all players in an `eth_call`.

---

## 4. Trim the provisional payload

**Trigger:** couples with #2; matters once rounds are large.

The provisional snapshot (`computeProvisional`) currently contains **every player**, and
`/api/provisional` ships the whole thing to every client. A 10k-player JSON per request
is heavy bandwidth and approaches KV value-size limits. Trim to **top-N + the viewer's
own row** (the only rows the UI shows), computed server-side.

---

## 5. Paid infra tiers (enabler)

Underlies #1–#4. Current stack is all free tiers:
- **RPC:** public **forno** — will rate-limit heavy block reads (#1) and high wagmi
  read volume (#2). Need a **dedicated/paid Celo RPC**.
- **KV:** **Upstash Free** (500k commands/month, 256MB) — insufficient for the accumulator
  (#1) + un-cached client reads (#2). Move to a **paid KV or Postgres**.
- **Explorers:** free Blockscout/Etherscan — irrelevant once #1 removes per-player
  explorer calls, but keep a paid Etherscan key as a fallback source.

This is "buy bigger tiers + point config at them," not rework — but it's a prerequisite,
so budget for it alongside #1–#2.

---

## 6. Submission gas / batching strategy

**Trigger:** ~10k active players/day.

`recordStreak` runs once per (player, day), paid by the **oracle hot wallet** (protocol
cost). At 10k active/day that's 10k submissions/day. Already **batched**
(`batchSubmitStreaks`) and Celo gas is cheap, so this is the lowest priority — but at
10k it's a real recurring cost and a hot-wallet balance/monitoring concern. Revisit batch
sizing and hot-wallet top-ups; consider a multicall/aggregator if per-tx overhead grows.

---

## Current state (2026-07)
- Oracle cron **every 10 min** (`frontend/vercel.json`), **per-player** scan (the #1
  rearchitecture is not yet built).
- Dual-source scan (Blockscout + Etherscan union) so a single explorer gap doesn't drop a
  streak (`ETHERSCAN_API_KEY` in Vercel).
- **Optimistic UI shipped:** the streak card / leaderboard / profile reflect today's tx
  ~1 min after it lands (connected player) and via the provisional snapshot (~10 min, all
  players), decoupling perceived liveness from the closed-day on-chain submission.
- KV reads are `force-no-store` (fixes a stale-Data-Cache bug; see #2 for the scale
  trade-off).
- All infra on **free tiers** (forno RPC, Upstash Free KV).
- These are fine for the current base; **#1 and #2 are the first things to build** as the
  player base grows toward ~1k.
