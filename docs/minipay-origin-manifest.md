# MiniStreak — Network Origin Manifest

> Prepared for the MiniPay Mini App submission (network-transparency / supply-chain review).
> Scope: **production / Celo Mainnet (chainId 42220)**, app at `https://www.ministreak.app`.
> Last updated: 2026-06-28.

This is the full set of external origins the app contacts at runtime, by context.
Derived from the source (`frontend/lib`, `frontend/hooks`, `frontend/app`).

## A. Browser runtime — always contacted

| Origin | Purpose | Type | Configured by |
|--------|---------|------|---------------|
| `https://www.ministreak.app` | First-party app: HTML, JS/CSS chunks, self-hosted fonts (`/_next/static/media/*.woff2`), `/api/*` routes | First-party | — |
| `https://forno.celo.org` | Celo L2 JSON-RPC — on-chain reads (round / pot / streak) and transaction submission | RPC | `NEXT_PUBLIC_CELO_RPC_URL` |
| `https://api.studio.thegraph.com` | The Graph subgraph — leaderboard / streak-history queries | API (GraphQL) | `NEXT_PUBLIC_GRAPH_API_URL` |

## B. Browser — user-initiated navigations (opened on tap, not background)

| Origin | Purpose |
|--------|---------|
| `https://minipay.opera.com` | Deposit deeplink (`/add_cash`) when balance is low |
| `https://docs.google.com` | Support form (in-app Support link) |

## C. Server-side only — Vercel cron functions (not the browser)

| Origin | Purpose | Where |
|--------|---------|-------|
| `https://forno.celo.org` | RPC for oracle / resolve / health crons | `/api/oracle`, `/api/resolve`, `/api/health` |
| `https://celo.blockscout.com/api/v2` | Reads a player's outgoing transaction history to compute streaks | `lib/oracle/scanner.ts` |

## Not contacted in production

- **`fonts.googleapis.com` / `fonts.gstatic.com`** — fonts are self-hosted via `next/font`; the Google Fonts CDN is no longer contacted.
- **WalletConnect** (`relay.walletconnect.com`, `explorer-api.walletconnect.com`, `verify.walletconnect.com`) — the WalletConnect connector only loads if `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set. It is **not** set in production: MiniPay uses the injected connector, so these origins are never contacted.
- **Testnet / local origins** (`forno.celo-sepolia.celo-testnet.org`, `alfajores-forno.celo-testnet.org`, `celo-sepolia.blockscout.com`, `127.0.0.1:8545`) — only used when the chain is Celo Sepolia or a local node.
- Documentation / funding URLs that appear in code comments and package metadata (e.g. `github.com`, `nextjs.org`) — never called at runtime.
