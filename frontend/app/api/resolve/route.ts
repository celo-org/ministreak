/**
 * GET /api/resolve
 * Vercel Cron handler — resolves the current round once its end time has
 * passed, distributing payouts (or refunding if < MIN_PLAYERS) and starting
 * the next round.
 *
 * Triggered hourly by Vercel Cron. Self-healing: it is a cheap 2-read no-op
 * until `now >= round.endTime`, then it resolves once. The on-chain contract
 * has NO endTime guard, so this route enforces the timing itself.
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
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

export const dynamic = "force-dynamic";
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
    const rpcUrl =
      process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo.org";
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
      transport: http(rpcUrl),
    });

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(rpcUrl),
    });

    // ─── Read current round ───────────────────────────────────────────────────
    const roundId = await publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "getCurrentRoundId",
    });

    const [, endTime, , status] = (await publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "rounds",
      args: [roundId],
    })) as [bigint, bigint, bigint, number, bigint];

    const nowSec = BigInt(Math.floor(Date.now() / 1000));

    // Not yet due — no-op.
    if (nowSec < endTime) {
      return NextResponse.json({
        ok: true,
        action: "skipped",
        reason: "round not ended",
        round: Number(roundId),
        endTime: Number(endTime),
        now: Number(nowSec),
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
