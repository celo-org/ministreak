# Oracle Vercel Cron Migration

**Date:** 2026-04-04
**Status:** Draft

## Overview

Migrate the oracle-service from a local Node.js cron process to a Vercel serverless cron function within the existing frontend Next.js app. Eliminates the need to run the oracle locally.

## Architecture

A single API route `GET /api/oracle` runs the oracle logic. Vercel cron triggers it once daily at 11 PM UTC (`0 23 * * *`) — late in the day to catch most players' daily transactions. The route is stateless: no local DB, no file I/O. Duplicate-submission checks use the on-chain `isSubmitted()` view function.

### Execution Budget

Vercel free plan: 10-second function timeout. To fit within this:

1. **Concurrent Blockscout fetches** — `Promise.all()` across all players instead of sequential
2. **Multicall for `isSubmitted()`** — single RPC call checks all player/day combinations
3. **`batchSubmitStreaks()`** — single on-chain transaction for all qualifying players

Expected execution: ~5-7 seconds for up to 50 players.

## Files

### New Files

- `frontend/lib/oracle/scanner.ts` — `getCurrentRound()`, `scanAllPlayers()`, `fetchOutgoingTxs()`
- `frontend/lib/oracle/submitter.ts` — `checkAlreadySubmitted()`, `submitStreaks()`
- `frontend/app/api/oracle/route.ts` — GET handler, orchestrates scan + submit

### Modified Files

- `frontend/vercel.json` — add cron config

### Not Migrated (Dropped)

- `oracle-service/src/db.ts` — replaced by on-chain `isSubmitted()` checks
- `oracle-service/src/config.ts` — replaced by direct `process.env` access
- `oracle-service/src/logger.ts` — replaced by `console.log/warn/error`
- `oracle-service/src/index.ts` — replaced by API route handler

## API Route: `GET /api/oracle`

### Security

The route verifies the request is from Vercel Cron by checking the `Authorization` header against the `CRON_SECRET` env var. Returns 401 for unauthorized requests. This prevents public triggering.

### Flow

```
1. Verify CRON_SECRET header
2. Create viem clients (public + wallet)
3. getCurrentRound() → { roundId, startTime, players[] }
4. If no players → return early
5. Compute today's dayIndex from roundStartTime
6. Promise.all() → fetch outgoing txs for all players from Blockscout (concurrent)
7. multicall → isSubmitted() for all players with qualifying txs
8. Filter to only unsubmitted qualifying players
9. If none → return early
10. batchSubmitStreaks() → single on-chain tx
11. Return JSON summary: { round, scanned, submitted, skipped, errors }
```

### Response Format

```json
{
  "ok": true,
  "round": 5,
  "playersScanned": 12,
  "streaksSubmitted": 8,
  "alreadySubmitted": 3,
  "noActivity": 1,
  "errors": []
}
```

## `frontend/lib/oracle/scanner.ts`

Ported from `oracle-service/src/scanner.ts` with these changes:

- **Blockscout API URL:** `https://celo.blockscout.com/api/v2` (Celo mainnet)
- **Blockscout API key:** passed as `apikey` query parameter from `process.env.BLOCKSCOUT_API_KEY`
- **Chain definition:** Celo mainnet (chainId 42220) instead of Celo Sepolia
- **RPC URL:** from `process.env.CELO_RPC_URL` (server-side, no NEXT_PUBLIC_ prefix needed but reuses existing)
- **No `isAlreadySubmitted` callback parameter** — the route handler does this via multicall separately
- **`scanAllPlayers()` runs concurrently** — `Promise.allSettled()` instead of sequential for-loop
- **Logging:** `console.log` / `console.warn` instead of custom logger

### Key Functions

- `getCurrentRound(client, vaultAddress)` — reads roundId, round struct, player list from contract
- `scanPlayerToday(player, roundInfo)` — fetches outgoing txs from Blockscout, filters self-sends, returns `QualifyingTx | null`
- `scanAllPlayers(players, roundInfo)` — concurrent wrapper, returns `QualifyingTx[]`

## `frontend/lib/oracle/submitter.ts`

Ported from `oracle-service/src/submitter.ts` with these changes:

- **Chain definition:** Celo mainnet
- **Only `batchSubmitStreaks()`** — no individual `submitStreak()`, always batch for efficiency
- **`checkAlreadySubmitted()`** — uses viem `multicall` to check `isSubmitted(player, roundId, dayIndex)` for all qualifying players in one RPC call. Returns a Set of already-submitted player addresses.
- **Gas price:** fetched with 30% buffer (mainnet gas is higher than testnet)

### Key Functions

- `checkAlreadySubmitted(client, oracleAddress, qualifyingTxs)` — multicall `isSubmitted()`, returns `Set<Address>`
- `batchSubmitStreaks(walletClient, publicClient, oracleAddress, qualifyingTxs)` — single batch transaction

## Environment Variables (New Server-Side)

These are added to Vercel (NOT prefixed with `NEXT_PUBLIC_` since they're server-only):

| Variable | Value | Purpose |
|----------|-------|---------|
| `ORACLE_PRIVATE_KEY` | `0x...` | Signs streak submission txs |
| `CRON_SECRET` | random string | Vercel cron auth header |
| `BLOCKSCOUT_API_KEY` | `proapi_ds9JM1...` | Blockscout API rate limits |

Reuses existing Vercel env vars:
- `NEXT_PUBLIC_VAULT_ADDRESS`
- `NEXT_PUBLIC_ORACLE_ADDRESS`
- `NEXT_PUBLIC_CELO_RPC_URL`

## `vercel.json` Changes

Add `crons` field to existing config:

```json
{
  "crons": [{ "path": "/api/oracle", "schedule": "0 23 * * *" }]
}
```

This runs the oracle daily at 11 PM UTC — near end of day to catch the most activity.

## Vercel Free Plan Constraints

- **10-second execution limit** — mitigated by concurrent fetches, multicall, batch submit
- **1 cron job** — we only need one
- **Daily frequency max** — acceptable for this game's rules (streaks are per-day)

## What Happens to oracle-service/

The standalone oracle-service directory is no longer needed for production. It can remain in the repo as a reference or for local testing, but the production oracle runs as the Vercel cron function.
