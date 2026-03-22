# Celo Grind — Weekly Transaction Streak Leaderboard

A MiniPay Mini App that runs weekly on-chain transaction streak competitions on Celo.
Players pay 0.5 USDT to enter, maintain daily qualifying transactions to build streaks,
and the longest streak at week's end wins the USDT pot.

**Game currency:** USDT (MockUSDT on testnets, real USDT on mainnet)
**Testnet:** Celo Sepolia (chainId 11142220)
**Mainnet:** Celo Mainnet (chainId 42220)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     User / MiniPay / Browser                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ wagmi + viem (legacy tx mode)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 14 Frontend                           │
│           (Vercel) — App Router, Tailwind CSS                   │
│                                                                 │
│  / Home   /leaderboard   /me   /rounds   /rules                 │
└────────┬──────────────────────────────┬────────────────────────┘
         │ contract reads/writes         │ GraphQL queries
         ▼                              ▼
┌────────────────────┐      ┌──────────────────────────┐
│  MiniStreak        │      │  The Graph Subgraph       │
│  StreakOracle      │      │  (PlayerEntered,          │
│  (Celo Sepolia)    │      │   StreakRecorded, etc.)   │
└────────┬───────────┘      └──────────────────────────┘
         │ ORACLE_ROLE
         ▼
┌────────────────────────────────────────────────────────────────┐
│               Oracle Service (Node.js + cron)                  │
│                                                                │
│  1. Scan player USDT tx via Celo RPC (every hour)             │
│  2. Validate: not self-send, value >= 0.50 USDT, today UTC     │
│  3. Submit proof to StreakOracle.sol                           │
│  4. Log to SQLite to prevent double-submits                    │
└────────────────────────────────────────────────────────────────┘
         │ Chainlink Automation (weekly, Sunday 23:59 UTC)
         ▼
┌──────────────────────────────────┐
│  MiniStreak.resolveRound()      │
│  — compute rankings             │
│  — distribute USDT prizes       │
│  — start next round             │
└──────────────────────────────────┘
```

---

## Project Structure

```
celo-grind/
├── contracts/            # Hardhat + Solidity smart contracts
│   ├── src/
│   │   ├── MiniStreak.sol    # Main game vault
│   │   ├── StreakOracle.sol      # Off-chain data bridge
│   │   └── MockERC20.sol         # Test-only ERC20 (local + testnet)
│   ├── test/
│   │   └── MiniStreak.test.ts  # 48 tests
│   ├── scripts/
│   │   ├── deploy-local.ts       # Local Hardhat node deploy + env setup
│   │   ├── deploy.ts             # Deploy to Celo Sepolia / Mainnet
│   │   ├── verify.ts             # Verify on Blockscout / Celoscan
│   │   └── setup-chainlink.ts   # Register Chainlink Automation
│   ├── hardhat.config.ts
│   └── constants.ts              # Addresses + ABIs
│
├── subgraph/             # The Graph subgraph
│   ├── schema.graphql
│   ├── subgraph.yaml
│   └── src/mapping.ts
│
├── oracle-service/       # Off-chain streak scanner
│   ├── src/
│   │   ├── index.ts      # Main cron entry point
│   │   ├── scanner.ts    # Celo RPC transaction scanner
│   │   ├── submitter.ts  # Oracle contract submitter
│   │   ├── db.ts         # SQLite rate-limit tracking
│   │   ├── logger.ts     # Structured logger
│   │   └── config.ts     # Env var config
│   ├── Dockerfile
│   └── .env.example
│
└── frontend/             # Next.js 14 MiniPay app
    ├── app/
    │   ├── page.tsx          # Home / Dashboard
    │   ├── leaderboard/page.tsx
    │   ├── me/page.tsx
    │   ├── rounds/page.tsx
    │   └── rules/page.tsx
    ├── components/
    ├── hooks/
    ├── lib/
    │   ├── wagmi.ts        # wagmi config (Celo Sepolia + MiniPay + localhost)
    │   ├── contracts.ts    # Contract addresses + ABIs
    │   └── graphql.ts      # The Graph queries
    └── vercel.json
```

---

## Running Locally (Start Here)

Local dev uses a Hardhat node with MockUSDT. No real funds needed.
The subgraph and oracle service are **not required** locally.

### Prerequisites

- Node.js 20+
- MetaMask browser extension

### Step 1 — Install dependencies

```bash
cd contracts && npm install
cd ../frontend && npm install
```

### Step 2 — Run contract tests (optional but recommended)

```bash
cd contracts && npm test
# Expected: 48 passing
```

### Step 3 — Start the local Hardhat node

**Terminal 1** (keep running):

```bash
cd contracts && npm run node
```

### Step 4 — Deploy contracts locally

**Terminal 2**:

```bash
cd contracts && npm run deploy:local
```

This deploys MockUSDT + MiniStreak + StreakOracle, mints 10,000 USDT to
the first 5 test accounts, and **auto-writes `frontend/.env.local`**.

> Every time you restart the Hardhat node, re-run `deploy:local` to get fresh addresses.

### Step 5 — Configure MetaMask

1. Add a custom network:
   - **Network name:** Localhost 8545
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency symbol:** ETH

2. Import a test account (Account #3 — pre-funded):
   ```
   0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
   ```

### Step 6 — Start the frontend

**Terminal 3**:

```bash
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Step 7 — Resolve a round early (for testing)

```bash
cd contracts && npx hardhat console --network localhost
```

```js
const vault = await ethers.getContractAt("MiniStreak", "0xYOUR_VAULT_ADDR")
const roundId = await vault.getCurrentRoundId()
await vault.resolveRound(roundId)  // deployer has KEEPER_ROLE
```

---

## Deploy to Celo Sepolia Testnet

Celo Sepolia is Celo's primary developer testnet (chainId 11142220, replaces Alfajores).
**Official USDT is already live on Celo Sepolia** — the deploy script uses it directly, no MockUSDT needed.

### Requirements

- CELO on Celo Sepolia for gas
  → Faucet: [faucet.celo.org/celo-sepolia](https://faucet.celo.org/celo-sepolia)
  → Google Cloud faucet: [cloud.google.com/application/web3/faucet/celo/sepolia](https://cloud.google.com/application/web3/faucet/celo/sepolia)
- Block explorer: [celo-sepolia.blockscout.com](https://celo-sepolia.blockscout.com)

### 1. Configure contracts

```bash
cd contracts
cp .env.example .env
```

Fill in `.env`:

```env
DEPLOYER_PRIVATE_KEY=0xYOUR_WALLET_PRIVATE_KEY
TREASURY_ADDRESS=0xYOUR_TREASURY_WALLET
ORACLE_HOT_WALLET=0xYOUR_ORACLE_HOT_WALLET   # can be same as deployer initially
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
```

### 2. Deploy contracts

```bash
npm run deploy:sepolia
```

The script:
1. Uses the official USDT on Celo Sepolia: `0xd077A400968890Eacc75cdc901F0356c943e4fDb` (6 decimals)
2. Deploys `MiniStreak` (with real USDT as game token)
3. Deploys `StreakOracle`
4. Grants `ORACLE_ROLE` to StreakOracle
5. Saves deployment info to `contracts/deployments/celoSepolia.json`

The output prints all three addresses. **Copy them.**

### 3. Update constants.ts

In `contracts/constants.ts`, fill in `DEPLOYED_ADDRESSES[11142220].vault` and `.oracle` with the output addresses.
The USDT address (`0xd077A400968890Eacc75cdc901F0356c943e4fDb`) is already pre-filled.

### 4. Verify contracts on Blockscout

```bash
npm run verify:sepolia
```

Verification on Blockscout does not require an API key for Celo Sepolia.

### 5. Configure the frontend

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_CHAIN_ID=11142220
NEXT_PUBLIC_CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
NEXT_PUBLIC_VAULT_ADDRESS=0xYOUR_VAULT_ADDRESS
NEXT_PUBLIC_ORACLE_ADDRESS=0xYOUR_ORACLE_ADDRESS
NEXT_PUBLIC_USDT_ADDRESS=0xd077A400968890Eacc75cdc901F0356c943e4fDb
NEXT_PUBLIC_GRAPH_API_URL=
NEXT_PUBLIC_CHARITY_ADDRESS=0x4C6Aa14F58aFb01CB0515aD33e03Ec16a67f4E55
NEXT_TELEMETRY_DISABLED=1
```

### 6. Deploy the frontend to Vercel

#### Option A — Vercel CLI

```bash
cd frontend
npm i -g vercel
vercel                   # follow prompts, connect to your GitHub repo
vercel env add NEXT_PUBLIC_CHAIN_ID          # set each env var
vercel env add NEXT_PUBLIC_VAULT_ADDRESS
vercel env add NEXT_PUBLIC_ORACLE_ADDRESS
vercel env add NEXT_PUBLIC_USDT_ADDRESS
vercel env add NEXT_PUBLIC_CELO_RPC_URL
vercel --prod            # deploy to production
```

#### Option B — Vercel Dashboard (recommended)

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Add all `NEXT_PUBLIC_*` environment variables from the list above
5. Deploy — Vercel auto-detects Next.js

The `frontend/vercel.json` is pre-configured with the correct build settings.

### 7. Configure the oracle service

```bash
cd oracle-service
cp .env.example .env
```

Fill in `.env`:

```env
ORACLE_PRIVATE_KEY=0xYOUR_ORACLE_HOT_WALLET_PRIVATE_KEY
CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
VAULT_ADDRESS=0xYOUR_VAULT_ADDRESS
ORACLE_ADDRESS=0xYOUR_ORACLE_ADDRESS
USDT_ADDRESS=0xd077A400968890Eacc75cdc901F0356c943e4fDb
```

Run the oracle:

```bash
npm install && npm run dev
```

Or containerised:

```bash
docker build -t celo-grind-oracle .
docker run -v $(pwd)/data:/data --env-file .env celo-grind-oracle
```

### 8. (Optional) Deploy the subgraph

```bash
cd subgraph
npm install -g @graphprotocol/graph-cli
npm install
```

Edit `subgraph.yaml`:
- Set `source.address` to your vault address
- Set `source.startBlock` to the deployment block (from Blockscout)
- Set `network` to `celo-sepolia` (if supported) or use hosted service

```bash
npm run codegen && npm run build && npm run deploy:studio
```

Update `NEXT_PUBLIC_GRAPH_API_URL` in your frontend env once deployed.

---

## Smart Contract Addresses

| Contract         | Network       | Address                                      |
|------------------|---------------|----------------------------------------------|
| MiniStreak       | Celo Sepolia  | `0x911BD7790a581831BbE544bC782cc78659ce41b8`  |
| StreakOracle     | Celo Sepolia  | `0x6827D8155eF79a7f2d8eA87f8E64b04b3E6936D7`  |
| USDT             | Celo Sepolia  | `0xd077A400968890Eacc75cdc901F0356c943e4fDb`  |
| MiniStreak       | Mainnet       | *After audit + mainnet deploy*                |
| StreakOracle     | Mainnet       | *After audit + mainnet deploy*                |
| USDT             | Mainnet       | Verify official address before use            |

---

## Game Rules

| Rule             | Value                                   |
|------------------|-----------------------------------------|
| Entry fee        | 0.5 USDT                                |
| Min streak tx    | 0.50 USDT (sent or received, no self)   |
| Round duration   | 7 days (Mon 00:00 — Sun 23:59 UTC)      |
| Protocol fee     | 5%                                      |
| 1st place prize  | 50% of distributable pot                |
| 2nd place prize  | 30% of distributable pot                |
| 3rd place prize  | 20% of distributable pot                |
| Min players      | 3 (else full refund)                    |
| Tiebreaker       | Highest cumulative USDT volume          |

---

## How the Oracle Service Works

1. **Cron runs every hour** via `node-cron`
2. **Fetches current round** and all registered players from the vault contract
3. **Scans USDT Transfer events** for each player on the Celo RPC
4. **Validates each tx**: `from !== to`, `value >= 0.50 USDT`, block timestamp is today UTC
5. **Checks SQLite** to avoid resubmitting already-processed txns
6. **Calls StreakOracle.submitStreak()** with the proof
7. **Records the submission** in SQLite
8. **Alerts via webhook** if oracle wallet CELO balance drops below threshold

---

## MiniPay Integration

- Detects MiniPay via `window.ethereum?.isMiniPay`
- All wallet UI hidden when inside MiniPay (wallet is implicit)
- All transactions use **legacy tx mode** (`gasPrice`, no EIP-1559)
- Mobile-first, Tailwind CSS only, no external component libraries

To submit for MiniPay listing: [minipay.to/mini-apps](https://minipay.to/mini-apps)

---

## Environment Variables Reference

### contracts/.env

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Yes | Wallet private key with 0x prefix. Must have CELO for gas. |
| `TREASURY_ADDRESS` | No | Receives 5% protocol fee. Defaults to deployer. |
| `ORACLE_HOT_WALLET` | No | Oracle submitter address. Defaults to deployer. |
| `CELO_SEPOLIA_RPC_URL` | No | Defaults to `https://forno.celo-sepolia.celo-testnet.org` |
| `USDT_ADDRESS` | No | Override USDT address. Auto-resolved per chain. |
| `BLOCKSCOUT_API_KEY` | No | Placeholder is fine for Celo Sepolia Blockscout. |

### frontend/.env.local

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CHAIN_ID` | Yes | `11142220` (Celo Sepolia) or `42220` (Mainnet) |
| `NEXT_PUBLIC_CELO_RPC_URL` | No | RPC endpoint. Defaults per chain. |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Yes | MiniStreak contract address |
| `NEXT_PUBLIC_ORACLE_ADDRESS` | Yes | StreakOracle contract address |
| `NEXT_PUBLIC_USDT_ADDRESS` | Yes | USDT token address |
| `NEXT_PUBLIC_GRAPH_API_URL` | No | The Graph subgraph endpoint. Leave empty for contract-only mode. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | No | WalletConnect project ID for non-MiniPay browsers. |
| `NEXT_PUBLIC_CHARITY_ADDRESS` | No | Destination for TxShortcut streak transactions. |

### oracle-service/.env

| Variable | Required | Description |
|----------|----------|-------------|
| `ORACLE_PRIVATE_KEY` | Yes | Hot wallet private key (0x prefix). Must have CELO for gas. |
| `CELO_RPC_URL` | No | Defaults to Celo Sepolia RPC. |
| `VAULT_ADDRESS` | Yes | MiniStreak contract address. |
| `ORACLE_ADDRESS` | Yes | StreakOracle contract address. |
| `DB_PATH` | No | SQLite database path. Default `./oracle.db`. |
| `CRON_SCHEDULE` | No | Oracle run schedule. Default `0 * * * *` (hourly). |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error`. Default `info`. |
| `WEBHOOK_ALERT_URL` | No | Slack/Discord webhook for low-balance alerts. |
| `MIN_CELO_BALANCE` | No | Alert threshold in CELO. Default `0.1`. |

---

## Testing on MiniPay (Dev Mode)

1. Install MiniPay on your Android device (available on Google Play via Opera MiniPay)
2. Enable **Developer Mode** in MiniPay settings
3. In the dev tools, add your Vercel URL as a test dApp
4. MiniPay auto-connects via `window.ethereum` — no wallet connection needed
5. Ensure the frontend is deployed with `NEXT_PUBLIC_CHAIN_ID=11142220` (Celo Sepolia)
6. Get testnet USDT from the faucet or have someone transfer USDT on Celo Sepolia

**MiniPay-specific behaviors:**
- Wallet connect/disconnect buttons are hidden (wallet is implicit)
- All transactions use legacy tx mode (`gasPrice`, no EIP-1559)
- UI is mobile-only (`max-w-md`, fixed bottom navigation)

---

## Security Considerations

- **Access Control**: `ORACLE_ROLE` held only by StreakOracle. `KEEPER_ROLE` for Chainlink. Owner holds `DEFAULT_ADMIN_ROLE`.
- **Reentrancy**: All state-changing functions use `ReentrancyGuard`.
- **Rate Limiting**: StreakOracle enforces 1 submission per (player, round, day), tracked on-chain and in SQLite.
- **Pull over push**: Refunds use a pull pattern — players call `claimRefund()`.
- **Oracle hot wallet**: Keep `ORACLE_PRIVATE_KEY` secure. Monitor balance for gas.
- **Emergency stop**: Contract is `Pausable` — owner can pause in emergencies.
- **Audit**: Smart contracts should be audited before mainnet launch.
