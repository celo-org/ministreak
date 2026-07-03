/**
 * GET /api/resolve
 * Vercel Cron handler — resolves the current round once its end time has
 * passed, distributing payouts (or refunding if < MIN_PLAYERS) and starting
 * the next round.
 *
 * Triggered hourly by Vercel Cron (at :05, just after midnight UTC). Self-
 * healing: it is a cheap 2-read no-op until `now >= effectiveEnd` (the round's
 * calendar-snapped 7-day end), then it resolves once. The on-chain contract has
 * NO endTime guard, so this route enforces the timing itself — and gating on the
 * snapped end (not the raw, drifting contract endTime) keeps each new round
 * starting at ~00:00 UTC week after week.
 *
 * Signing wallet must hold KEEPER_ROLE (or DEFAULT_ADMIN_ROLE) on the vault.
 * Uses KEEPER_PRIVATE_KEY if set, otherwise falls back to ORACLE_PRIVATE_KEY
 * (which works out-of-the-box when the oracle wallet is also the deployer).
 */

import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import type { PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { runOracleScan } from "@/lib/oracle/run";
import { CELO_RPC_URL } from "@/lib/contracts";
import { DAY, effectiveRoundStart } from "@/lib/roundDay";

// A round runs 7 day-windows (matches the contract's DAYS_IN_ROUND).
const ROUND_DAYS = 7;

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // never cache RPC reads (stale round bug)
export const maxDuration = 60; // Vercel Pro plan

// RoundStatus enum: 0=Open, 1=Closed, 2=Resolved, 3=Refunded
const STATUS_OPEN = 0;
const STATUS_CLOSED = 1;

const VAULT_ABI = parseAbi([
  "function getCurrentRoundId() external view returns (uint256)",
  "function rounds(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 pot, uint8 status, uint256 playerCount)",
  "function resolveRound(uint256 roundId) external",
]);

export async function GET(request: Request) {
  try {
    // ─── Auth: verify Vercel Cron secret ──────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ─── Config from env ──────────────────────────────────────────────────────
    const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address;
    const rpcUrl = CELO_RPC_URL;
    // Keeper key holds KEEPER_ROLE; fall back to the oracle key (works when the
    // oracle wallet is also the deployer/admin).
    const privateKey = (process.env.KEEPER_PRIVATE_KEY ||
      process.env.ORACLE_PRIVATE_KEY) as `0x${string}`;

    if (!vaultAddress || !privateKey) {
      return NextResponse.json(
        {
          error:
            "Missing required env vars (NEXT_PUBLIC_VAULT_ADDRESS, KEEPER_PRIVATE_KEY or ORACLE_PRIVATE_KEY)",
        },
        { status: 500 }
      );
    }

    // ─── Viem clients ─────────────────────────────────────────────────────────
    const publicClient = createPublicClient({
      chain: celo,
      transport: http(rpcUrl, { fetchOptions: { cache: "no-store" } }),
    });

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(rpcUrl, { fetchOptions: { cache: "no-store" } }),
    });

    // ─── Read current round ───────────────────────────────────────────────────
    const roundId = await publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "getCurrentRoundId",
    });

    const [startTime, , , status] = (await publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "rounds",
      args: [roundId],
    })) as [bigint, bigint, bigint, number, bigint];

    const nowSec = Math.floor(Date.now() / 1000);

    // Resolve based on the CALENDAR (snapped) end, not the raw contract endTime.
    // The raw endTime = startTime + 7d ratchets forward each week (the new
    // startTime is the resolution timestamp), so gating on it made rounds drift
    // off midnight. effectiveRoundStart snaps a near-midnight start to 00:00 UTC,
    // so effectiveEnd is a clean midnight and the round re-anchors to midnight
    // every week — no drift. (For a legacy mid-day round this equals the raw
    // endTime, so behaviour is unchanged there.)
    const effectiveEnd = effectiveRoundStart(startTime) + ROUND_DAYS * DAY;

    // Not yet due — no-op.
    if (nowSec < effectiveEnd) {
      return NextResponse.json({
        ok: true,
        action: "skipped",
        reason: "round not ended",
        round: Number(roundId),
        effectiveEnd,
        now: nowSec,
      });
    }

    // Already resolved/refunded (status != Open/Closed) — no-op.
    if (status !== STATUS_OPEN && status !== STATUS_CLOSED) {
      return NextResponse.json({
        ok: true,
        action: "skipped",
        reason: "round already resolved/refunded",
        round: Number(roundId),
        status,
      });
    }

    // ─── Final oracle scan before resolving ───────────────────────────────────
    // The round is about to resolve, so submit any last-minute streaks first.
    // This closes the gap where endTime drifts into the oracle/resolve window
    // or the boundary oracle run failed, leaving the final day unsubmitted.
    // Best-effort: a scan failure is logged but does NOT block resolution — the
    // bulk of the week's streaks are already on-chain, and locking the round
    // (so entry fees can't be distributed/refunded) is worse than resolving on
    // a possibly-incomplete final day. Skipped when the oracle env is absent
    // (e.g. tests), and uses the oracle key (trustedSubmitter) for the scan.
    const oracleAddress = process.env.NEXT_PUBLIC_ORACLE_ADDRESS as Address;
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY as `0x${string}` | undefined;
    const apiKey = process.env.BLOCKSCOUT_API_KEY || "";

    if (oracleAddress && oraclePrivateKey) {
      try {
        console.log("Resolve: running final oracle scan before resolving...");
        const oracleAccount = privateKeyToAccount(oraclePrivateKey);
        const oracleWallet = createWalletClient({
          account: oracleAccount,
          chain: celo,
          transport: http(rpcUrl, { fetchOptions: { cache: "no-store" } }),
        });
        const scan = await runOracleScan(
          publicClient as unknown as PublicClient,
          oracleWallet as unknown as WalletClient,
          { vaultAddress, oracleAddress, apiKey }
        );
        console.log(`Resolve: final scan submitted ${scan.streaksSubmitted} streak(s).`);
      } catch (scanErr) {
        const m = scanErr instanceof Error ? scanErr.message : String(scanErr);
        console.warn(`Resolve: final oracle scan failed (proceeding anyway): ${m}`);
      }
    }

    // ─── Resolve ──────────────────────────────────────────────────────────────
    const gasPrice = await publicClient.getGasPrice();
    const gasPriceWithBuffer = (gasPrice * BigInt(130)) / BigInt(100);

    console.log(`Resolve: resolving round ${roundId}...`);
    const hash = await walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "resolveRound",
      args: [roundId],
      gasPrice: gasPriceWithBuffer,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`resolveRound tx ${hash} failed (status: ${receipt.status})`);
    }

    console.log(`Resolve: round ${roundId} resolved. Tx: ${hash}`);
    return NextResponse.json({
      ok: true,
      action: "resolved",
      round: Number(roundId),
      txHash: hash,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Resolve run failed: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
