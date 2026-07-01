# MiniStreak

Show up every day. Win the week.

MiniStreak is a weekly on-chain transaction streak competition on Celo. Pay 0.10 USDT to enter, send any outgoing transaction each day to keep your streak alive, and split the pot at week's end. Built for MiniPay.

Live demo: [ministreak-fe.vercel.app](https://ministreak-fe.vercel.app) · Repository: [github.com/djokerops/ministreak](https://github.com/djokerops/ministreak)

## How It Works

1. **Open in MiniPay** — the app auto-connects your wallet. No "Connect Wallet" button, no signatures.
2. **Enter the round** — pay 0.10 USDT to join this week's pot. Weekly rounds run Monday 00:00 → Sunday 23:59 UTC.
3. **Build your streak** — send any outgoing transaction each day (not a self-send). The oracle picks it up and extends your streak.
4. **Climb the board** — ranked by longest streak, then tx count, then unique recipients.
5. **Miss a day, you're out** — streak resets to zero. Show back up the next round.
6. **Round resolves** — winners split the pot 50 / 30 / 20 (minus a 5% protocol fee). Fewer than 3 players? All entry fees are refunded automatically.

## Features

- **MiniPay-native** — auto-connect via injected provider, no `personal_sign` / `eth_signTypedData`, USDT/USDC/USDm only (no CELO surfaced in the UI)
- **Pseudonym identity** — deterministic readable aliases (`BraveTiger-7F2A`) instead of raw `0x…` addresses across the wallet badge and leaderboard
- **Balance-aware entry CTA** — detects low USDT and routes to MiniPay's `add_cash` deeplink; if you hold USDC or USDm instead, shows a "swap to USDT first" explainer
- **Celo Builder Code attribution** — every on-chain action tags calldata with the issued code `celo_0xd7zeus` via `@gigahierz/builder-codes` (ERC-8021)
- **Oracle-backed streak validation** — off-chain scanner verifies daily activity from public RPC, submits on-chain proofs through a role-gated `StreakOracle`
- **Refund path** — if fewer than 3 players enter, the vault refunds every entry; no need to claim
- **Subgraph indexing** — The Graph provides fast leaderboard reads with on-chain RPC fallback
- **Light editorial theme** — cream paper aesthetic, deep forest + gold accents, readable type at proper sizes (no pixel font)

## Smart Contracts
(subject to change)

The on-chain layer is two contracts (no proxies, no upgradeability — fixed once deployed):

- **`MiniStreak`** — vault that holds entry fees, tracks per-player streak/tx-count/uniqueness, resolves payouts. Role-gated `ORACLE_ROLE` for streak submissions.
- **`StreakOracle`** — thin attestation contract that the off-chain oracle calls to record validated daily activity. Forwards to the vault via `recordStreak`.
- **Token**: USDT (6 decimals). Unowned-pixel-style payment? No — flat 0.10 USDT entry, vault custodies the pot.
- **Round**: 7 days, Monday 00:00 → Sunday 23:59 UTC. New round opens automatically.
- **Payout**: 50 / 30 / 20 of the distributable pot, after a 5% protocol fee to the treasury.
- **Tiebreaker**: cumulative USDT volume across qualifying daily transactions.

**Mainnet (Celo, chain ID 42220)**

| Contract | Address |
|---|---|
| MiniStreak vault | `0xcd125da0EC85c8414D39fa94011b607C2A5f17e5` |
| StreakOracle | `0x2c08420187F96a69E0aB64a1507282786E4f474e` |
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` |


## Getting Started (Run Locally)

The repo is a polyglot monorepo: Solidity (Hardhat), Next.js, a Node oracle, and a subgraph. Each package installs independently.

```bash
# 1. Smart contracts — compile + test
cd contracts
npm install
npm run compile
npm test

# 2. Frontend — Next.js dev server
cd ../frontend
npm install
NEXT_TELEMETRY_DISABLED=1 npm run dev    # http://localhost:3000

# 3. Oracle service — local scanner
cd ../oracle-service
npm install
npm run dev

# 4. Subgraph (optional — frontend falls back to RPC reads)
cd ../subgraph
npm install
```

Each package has its own `.env.example`. Copy to `.env` and fill in deployer/oracle private keys and RPC URLs.

### Deploying

```bash
cd contracts
npm run deploy:sepolia    # Celo Sepolia testnet
npm run deploy:mainnet    # Celo Mainnet
npm run verify:sepolia    # Blockscout verification (no API key required)
npm run verify:mainnet    # Celoscan verification
```

After deploying, copy the addresses into `frontend/.env.local` (NEXT_PUBLIC_VAULT_ADDRESS, NEXT_PUBLIC_ORACLE_ADDRESS, NEXT_PUBLIC_USDT_ADDRESS, NEXT_PUBLIC_CHAIN_ID).

## Project Structure

```
contracts/                    Solidity + Hardhat (TypeScript)
  src/
    MiniStreak.sol            Vault: entries, streaks, payouts
    StreakOracle.sol          Role-gated attestation forwarder
    MockERC20.sol             USDT mock for tests / local node
  scripts/
    deploy.ts                 Network-aware deploy (sepolia / mainnet)
    deploy-local.ts           Hardhat local node deployment
    verify.ts                 Blockscout / Celoscan verification
  test/
    MiniStreak.test.ts        Hardhat + chai (48 tests, all passing)
  deployments/                Per-network address manifests (committed)

frontend/                     Next.js 14 App Router
  app/
    page.tsx                  Home — pot, timer, streak, leaderboard top 5, how to play
    leaderboard/page.tsx      Full standings + per-round stats
    terms/page.tsx            Terms of Service (placeholder)
    privacy/page.tsx          Privacy Policy (placeholder)
    api/oracle/route.ts       Vercel cron endpoint (daily streak scan)
    api/health/route.ts       Liveness probe
  components/
    EntryButton.tsx           Pay-to-enter CTA with balance-aware states
    Leaderboard.tsx           Hairline-divided rows, medals on top 3
    StreakCard.tsx            Day-counter with "today's in" pill
    RoundTimer.tsx            Live countdown to round close
    WalletBadge.tsx           MiniPay auto-connect, pseudonym pill
    BottomNav.tsx             Home / Board tabs
    Footer.tsx                Inline Terms · Privacy · Support links
  hooks/
    useEnterRound             USDT approve + enterRound, gas-buffered
    useEntryEligibility       Reads USDT/USDC/USDm balances → ready/swap/deposit
    useLeaderboard            Subgraph query with on-chain RPC fallback
    useCurrentRound,
    usePlayerStats,
    useTodayStreak            On-chain reads via wagmi
  lib/
    contracts.ts              Addresses + ABIs + deeplinks
    pseudonym.ts              FNV-1a hash → readable alias
    builderCode.ts            ERC-8021 attribution suffix (celo_0xd7zeus)
    wagmi.ts                  Chain config (Celo / Sepolia / local)

oracle-service/               Node.js + cron streak scanner
  src/
    scanner.ts                Pulls outgoing txs per player via Celo RPC
    submitter.ts              Validates + calls StreakOracle.recordStreak
    db.ts                     SQLite — dedupe submitted (player, day) pairs
    config.ts                 Loads env, validates required vars
    index.ts                  Cron loop (default: hourly)

subgraph/                     The Graph hosted indexer
  schema.graphql              PlayerEntered, StreakRecorded, RoundResolved
  src/mapping.ts              Event handlers → entities

docs/superpowers/             Implementation plans + design specs
```

## Tech Stack

- **Framework**: Next.js 14 (App Router, RSC where possible)
- **Language**: TypeScript end-to-end (Solidity for contracts)
- **Styling**: Tailwind CSS + CSS variables, custom utilities for pills/cards
- **Fonts**: DM Sans (app), Fraunces (legal pages), JetBrains Mono (addresses)
- **Wallet**: wagmi v2 + viem v2, injected for MiniPay, WalletConnect optional fallback
- **Smart contracts**: Solidity 0.8.20, Hardhat 2.22, OpenZeppelin 5.x, `viaIR: true`
- **Oracle**: Node + ethers v6, SQLite for de-duplication, node-cron for scheduling (or Vercel cron in production)
- **Indexer**: The Graph (hosted), GraphQL queries from the frontend
- **Chain**: Celo Mainnet (42220) / Celo Sepolia (11142220) — legacy tx mode required
- **Deployment**: Vercel (frontend), self-hosted oracle or Vercel cron, The Graph Studio (subgraph)

## Design

- **Font**: DM Sans (400 / 500 / 600 / 700) across the app — Fraunces stays on `/terms` and `/privacy`
- **Light theme** (no dark mode):
  - Paper background `#FAF6EC` with a subtle dot-grain pattern
  - Paper tint `#F3EDD8` for the pot hero, timer cells, and "How to play" card
  - Ink `#1B1A17` primary, `#6B6452` secondary, `#A8A192` faint
  - Forest green `#1B6B3F` for primary actions and active states; deep `#0F4A2A` on hover
  - Trophy gold `#B8842B` for low-balance warnings and accent highlights
  - Coral `#C44536` for error states
- **Cards**: surface white with hairline `#E5DEC8` borders + soft warm shadow, or paper-tint variant for muted blocks
- **Buttons**: rounded-full pills, full width, `inline-flex justify-center` so both `<button>` and `<a>` center identically
- **Numbers**: tabular nums + tight letter-spacing for the pot, streak, and timer
- **Layout**: 360-px-first, max-width 28rem centered, generous vertical rhythm
