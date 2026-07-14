# Oracle Vercel Cron Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the oracle from a local Node.js cron process to a Vercel serverless cron function inside the existing frontend Next.js app.

**Architecture:** A single API route `GET /api/oracle` orchestrates the oracle run. It uses concurrent Blockscout API fetches, viem multicall for on-chain `isSubmitted()` checks, and `batchSubmitStreaks()` for a single submission transaction. Vercel cron triggers it daily at 11 PM UTC. No local database — all state comes from the blockchain.

**Tech Stack:** Next.js 14 App Router API routes, viem ^2.9.0, Vercel Cron, Celo mainnet Blockscout API

---

### Task 1: Create oracle scanner module

**Files:**
- Create: `frontend/lib/oracle/scanner.ts`

- [ ] **Step 1: Create `frontend/lib/oracle/scanner.ts`**

```ts
/**
 * scanner.ts
 * Fetches current round info and scans players' outgoing transactions
 * via the Celo mainnet Blockscout API.
 */

import {
  type Address,
  type PublicClient,
  parseAbi,
} from "viem";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QualifyingTx {
  player: Address;
  roundId: bigint;
  dayIndex: number;
  txCount: number;
  uniqueToCount: number;
}

export interface RoundInfo {
  roundId: bigint;
  startTime: bigint;
  endTime: bigint;
  players: Address[];
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const VAULT_ABI = parseAbi([
  "function getCurrentRoundId() external view returns (uint256)",
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
  "function rounds(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 pot, uint8 status, uint256 playerCount)",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BLOCKSCOUT_API = "https://celo.blockscout.com/api/v2";

function getTodayUTCWindow(): { start: number; end: number } {
  const now = Date.now();
  const startOfDay = Math.floor(now / 86400000) * 86400;
  return { start: startOfDay, end: startOfDay + 86399 };
}

function getDayIndex(todayStartTimestamp: bigint, roundStartTime: bigint): number {
  const secondsIntoRound = Number(todayStartTimestamp - roundStartTime);
  return Math.floor(secondsIntoRound / 86400);
}

// ─── Contract Reads ──────────────────────────────────────────────────────────

export async function getCurrentRound(
  client: PublicClient,
  vaultAddress: Address
): Promise<RoundInfo> {
  const roundId = await client.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "getCurrentRoundId",
  });

  const [startTime, endTime] = (await client.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "rounds",
    args: [roundId],
  })) as [bigint, bigint, bigint, number, bigint];

  const players = (await client.readContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "getRoundPlayers",
    args: [roundId],
  })) as Address[];

  return { roundId, startTime, endTime, players };
}

// ─── Blockscout Scanning ─────────────────────────────────────────────────────

async function fetchOutgoingTxsToday(
  address: Address,
  todayStart: number,
  todayEnd: number,
  apiKey: string
): Promise<Array<{ to: string | null; timestamp: number }>> {
  const txs: Array<{ to: string | null; timestamp: number }> = [];
  let nextPageParams: string | null = null;

  while (true) {
    const baseUrl = `${BLOCKSCOUT_API}/addresses/${address}/transactions?filter=from`;
    const url = nextPageParams
      ? `${baseUrl}${nextPageParams}&apikey=${apiKey}`
      : `${baseUrl}&apikey=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`Blockscout API error for ${address}: ${res.status}`);
      break;
    }

    const data: {
      items: Array<{ timestamp: string; to?: { hash: string } }>;
      next_page_params?: { block_number: string; index: number };
    } = await res.json();

    const items = data.items || [];
    let foundOlderThanToday = false;

    for (const item of items) {
      const ts = Math.floor(new Date(item.timestamp).getTime() / 1000);
      if (ts < todayStart) {
        foundOlderThanToday = true;
        break;
      }
      if (ts >= todayStart && ts <= todayEnd) {
        txs.push({ to: item.to?.hash || null, timestamp: ts });
      }
    }

    if (foundOlderThanToday || !data.next_page_params) break;
    const params = data.next_page_params;
    nextPageParams = `&block_number=${params.block_number}&index=${params.index}`;
  }

  return txs;
}

function analyzePlayerTxs(
  player: Address,
  txs: Array<{ to: string | null; timestamp: number }>,
  roundInfo: RoundInfo,
  dayIndex: number
): QualifyingTx | null {
  // Filter out self-sends
  const validTxs = txs.filter(
    (tx) => tx.to && tx.to.toLowerCase() !== player.toLowerCase()
  );

  if (validTxs.length === 0) return null;

  const uniqueToAddresses = new Set<string>();
  for (const tx of validTxs) {
    uniqueToAddresses.add(tx.to!.toLowerCase());
  }

  return {
    player,
    roundId: roundInfo.roundId,
    dayIndex,
    txCount: validTxs.length,
    uniqueToCount: uniqueToAddresses.size,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan all players concurrently for today's qualifying transactions.
 * Returns only players who have valid outgoing txs today (not self-sends).
 */
export async function scanAllPlayers(
  roundInfo: RoundInfo,
  apiKey: string
): Promise<QualifyingTx[]> {
  const { start: todayStart, end: todayEnd } = getTodayUTCWindow();
  const dayIndex = getDayIndex(BigInt(todayStart), roundInfo.startTime);

  if (dayIndex < 0 || dayIndex > 6) {
    console.log(`dayIndex ${dayIndex} out of range (0-6), skipping scan`);
    return [];
  }

  const results = await Promise.allSettled(
    roundInfo.players.map(async (player) => {
      const txs = await fetchOutgoingTxsToday(player, todayStart, todayEnd, apiKey);
      if (txs.length === 0) return null;
      return analyzePlayerTxs(player, txs, roundInfo, dayIndex);
    })
  );

  const qualifying: QualifyingTx[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      qualifying.push(result.value);
    } else if (result.status === "rejected") {
      console.warn(`Player scan failed: ${result.reason}`);
    }
  }

  return qualifying;
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
cd /Users/arua/Desktop/celo-grind/frontend && npx tsc --noEmit lib/oracle/scanner.ts 2>&1 || true
```

Check output for type errors. Fix any if found.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/oracle/scanner.ts
git commit -m "feat: add oracle scanner module for Vercel cron"
```

---

### Task 2: Create oracle submitter module

**Files:**
- Create: `frontend/lib/oracle/submitter.ts`

- [ ] **Step 1: Create `frontend/lib/oracle/submitter.ts`**

```ts
/**
 * submitter.ts
 * Checks on-chain submission status via multicall and batch-submits
 * qualifying streaks to StreakOracle.
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  parseAbi,
} from "viem";
import type { QualifyingTx } from "./scanner";

const ORACLE_ABI = parseAbi([
  "function batchSubmitStreaks(address[] calldata players, uint256[] calldata roundIds, uint8[] calldata dayIndexes, uint32[] calldata txCounts, uint16[] calldata uniqueToCounts) external",
  "function isSubmitted(address player, uint256 roundId, uint256 dayIndex) external view returns (bool)",
]);

/**
 * Check which qualifying txs have already been submitted on-chain.
 * Uses viem multicall for a single RPC round-trip.
 * Returns a Set of player addresses that are already submitted.
 */
export async function checkAlreadySubmitted(
  client: PublicClient,
  oracleAddress: Address,
  qualifyingTxs: QualifyingTx[]
): Promise<Set<string>> {
  if (qualifyingTxs.length === 0) return new Set();

  const calls = qualifyingTxs.map((q) => ({
    address: oracleAddress,
    abi: ORACLE_ABI,
    functionName: "isSubmitted" as const,
    args: [q.player, q.roundId, BigInt(q.dayIndex)] as const,
  }));

  const results = await client.multicall({ contracts: calls });

  const alreadySubmitted = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "success" && results[i].result === true) {
      alreadySubmitted.add(qualifyingTxs[i].player.toLowerCase());
    }
  }

  return alreadySubmitted;
}

/**
 * Batch-submit all qualifying streaks in a single on-chain transaction.
 * Returns the transaction hash.
 */
export async function batchSubmitStreaks(
  walletClient: WalletClient,
  publicClient: PublicClient,
  oracleAddress: Address,
  qualifyingTxs: QualifyingTx[]
): Promise<string> {
  const players = qualifyingTxs.map((q) => q.player);
  const roundIds = qualifyingTxs.map((q) => q.roundId);
  const dayIndexes = qualifyingTxs.map((q) => q.dayIndex);
  const txCounts = qualifyingTxs.map((q) => q.txCount);
  const uniqueToCounts = qualifyingTxs.map((q) => q.uniqueToCount);

  // Fetch gas price with 30% buffer for mainnet
  const gasPrice = await publicClient.getGasPrice();
  const gasPriceWithBuffer = (gasPrice * BigInt(130)) / BigInt(100);

  const hash = await (walletClient.writeContract as any)({
    address: oracleAddress,
    abi: ORACLE_ABI,
    functionName: "batchSubmitStreaks",
    args: [players, roundIds, dayIndexes, txCounts, uniqueToCounts],
    gasPrice: gasPriceWithBuffer,
  });

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Batch submit tx ${hash} failed (status: ${receipt.status})`);
  }

  return hash;
}
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd /Users/arua/Desktop/celo-grind/frontend && npx tsc --noEmit lib/oracle/submitter.ts 2>&1 || true
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/oracle/submitter.ts
git commit -m "feat: add oracle submitter module with multicall + batch submit"
```

---

### Task 3: Create the API route handler

**Files:**
- Create: `frontend/app/api/oracle/route.ts`

- [ ] **Step 1: Create `frontend/app/api/oracle/route.ts`**

```ts
/**
 * GET /api/oracle
 * Vercel Cron handler — scans players and submits qualifying streaks.
 * Triggered daily at 11 PM UTC by Vercel Cron.
 */

import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { getCurrentRound, scanAllPlayers } from "@/lib/oracle/scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "@/lib/oracle/submitter";

export const dynamic = "force-dynamic";
export const maxDuration = 10; // Vercel free plan limit

export async function GET(request: Request) {
  // ─── Auth: verify Vercel Cron secret ───────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ─── Config from env ───────────────────────────────────────────────────────
  const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address;
  const oracleAddress = process.env.NEXT_PUBLIC_ORACLE_ADDRESS as Address;
  const rpcUrl = process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org";
  const privateKey = process.env.ORACLE_PRIVATE_KEY as `0x${string}`;
  const apiKey = process.env.BLOCKSCOUT_API_KEY || "";

  if (!vaultAddress || !oracleAddress || !privateKey) {
    return NextResponse.json(
      { error: "Missing required env vars (VAULT_ADDRESS, ORACLE_ADDRESS, ORACLE_PRIVATE_KEY)" },
      { status: 500 }
    );
  }

  // ─── Viem clients ──────────────────────────────────────────────────────────
  const publicClient = createPublicClient({
    chain: celo,
    transport: http(rpcUrl),
  });

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(rpcUrl),
  });

  // ─── Oracle run ────────────────────────────────────────────────────────────
  const errors: string[] = [];

  try {
    // 1. Get current round and players
    console.log("Oracle: fetching current round...");
    const roundInfo = await getCurrentRound(publicClient, vaultAddress);
    console.log(`Oracle: round ${roundInfo.roundId}, ${roundInfo.players.length} players`);

    if (roundInfo.players.length === 0) {
      return NextResponse.json({
        ok: true,
        round: Number(roundInfo.roundId),
        playersScanned: 0,
        streaksSubmitted: 0,
        alreadySubmitted: 0,
        noActivity: 0,
        errors: [],
      });
    }

    // 2. Scan all players concurrently
    console.log("Oracle: scanning players...");
    const qualifying = await scanAllPlayers(roundInfo, apiKey);
    console.log(`Oracle: ${qualifying.length} qualifying out of ${roundInfo.players.length}`);

    const noActivity = roundInfo.players.length - qualifying.length;

    if (qualifying.length === 0) {
      return NextResponse.json({
        ok: true,
        round: Number(roundInfo.roundId),
        playersScanned: roundInfo.players.length,
        streaksSubmitted: 0,
        alreadySubmitted: 0,
        noActivity,
        errors: [],
      });
    }

    // 3. Check which are already submitted on-chain (multicall)
    console.log("Oracle: checking on-chain submission status...");
    const submitted = await checkAlreadySubmitted(publicClient, oracleAddress, qualifying);
    const unsubmitted = qualifying.filter(
      (q) => !submitted.has(q.player.toLowerCase())
    );

    console.log(`Oracle: ${submitted.size} already submitted, ${unsubmitted.length} new`);

    if (unsubmitted.length === 0) {
      return NextResponse.json({
        ok: true,
        round: Number(roundInfo.roundId),
        playersScanned: roundInfo.players.length,
        streaksSubmitted: 0,
        alreadySubmitted: submitted.size,
        noActivity,
        errors: [],
      });
    }

    // 4. Batch submit all unsubmitted streaks
    console.log(`Oracle: batch submitting ${unsubmitted.length} streaks...`);
    const txHash = await batchSubmitStreaks(
      walletClient,
      publicClient,
      oracleAddress,
      unsubmitted
    );
    console.log(`Oracle: batch submitted. Tx: ${txHash}`);

    return NextResponse.json({
      ok: true,
      round: Number(roundInfo.roundId),
      playersScanned: roundInfo.players.length,
      streaksSubmitted: unsubmitted.length,
      alreadySubmitted: submitted.size,
      noActivity,
      txHash,
      errors: [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Oracle run failed: ${msg}`);
    errors.push(msg);

    return NextResponse.json(
      { ok: false, error: msg, errors },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the build passes**

```bash
cd /Users/arua/Desktop/celo-grind/frontend && npm run build
```

Expected: Build succeeds. The `/api/oracle` route should appear as a serverless function (not static).

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/oracle/route.ts
git commit -m "feat: add /api/oracle route for Vercel cron"
```

---

### Task 4: Add Vercel cron config and env vars

**Files:**
- Modify: `frontend/vercel.json`

- [ ] **Step 1: Update `frontend/vercel.json`**

Add the `crons` field to the existing config. The full file should be:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install --legacy-peer-deps",
  "env": {
    "NEXT_TELEMETRY_DISABLED": "1"
  },
  "crons": [
    {
      "path": "/api/oracle",
      "schedule": "0 23 * * *"
    }
  ]
}
```

- [ ] **Step 2: Add server-side env vars to Vercel**

Run these commands (each pipes the value into `vercel env add`):

```bash
cd /Users/arua/Desktop/celo-grind/frontend

# ORACLE_PRIVATE_KEY — the oracle hot wallet private key (server-side only)
echo "0xYOUR_ORACLE_PRIVATE_KEY" | vercel env add ORACLE_PRIVATE_KEY production

# CRON_SECRET — random string for cron auth
echo "ministreak-cron-$(openssl rand -hex 16)" | vercel env add CRON_SECRET production

# BLOCKSCOUT_API_KEY
echo "YOUR_BLOCKSCOUT_API_KEY" | vercel env add BLOCKSCOUT_API_KEY production
```

- [ ] **Step 3: Deploy to Vercel**

```bash
cd /Users/arua/Desktop/celo-grind/frontend && vercel --prod
```

Expected: Deploy succeeds, cron is registered. Check with `vercel crons ls`.

- [ ] **Step 4: Commit**

```bash
git add frontend/vercel.json
git commit -m "chore: add Vercel cron config for daily oracle run at 23:00 UTC"
```

---

### Task 5: Test the oracle endpoint manually

- [ ] **Step 1: Test locally**

```bash
cd /Users/arua/Desktop/celo-grind/frontend && npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3000/api/oracle | python3 -m json.tool
```

Expected: JSON response with `ok: true` (or `ok: false` with an error message if env vars aren't set locally — that's fine, the important thing is the route loads and runs).

- [ ] **Step 2: Test on Vercel**

After deployment, test the production endpoint (using the CRON_SECRET):

```bash
CRON_SECRET=$(vercel env pull --yes 2>/dev/null && grep CRON_SECRET .env.local | cut -d= -f2-)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://frontend-roan-phi-84.vercel.app/api/oracle | python3 -m json.tool
```

Expected: JSON response with oracle run results.

- [ ] **Step 3: Verify cron is registered**

```bash
vercel crons ls
```

Expected: Shows `/api/oracle` scheduled at `0 23 * * *`.
