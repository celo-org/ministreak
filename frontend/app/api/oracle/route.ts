/**
 * GET /api/oracle
 * Vercel Cron handler — scans players and submits qualifying streaks.
 * Triggered hourly by Vercel Cron. Idempotent: already-submitted streaks
 * are filtered out via an on-chain multicall, so re-running within a day
 * only picks up players who newly qualified.
 */

import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { getCurrentRound, scanAllPlayers } from "@/lib/oracle/scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "@/lib/oracle/submitter";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro plan

export async function GET(request: Request) {
  try {
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
    const roundInfo = await getCurrentRound(publicClient as unknown as PublicClient, vaultAddress);
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
    const submitted = await checkAlreadySubmitted(publicClient as unknown as PublicClient, oracleAddress, qualifying);
    const unsubmitted = qualifying.filter(
      (q) => !submitted.has(`${q.player.toLowerCase()}:${q.dayIndex}`)
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
      walletClient as unknown as WalletClient,
      publicClient as unknown as PublicClient,
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
  } catch (topLevelErr) {
    const msg = topLevelErr instanceof Error ? topLevelErr.message : String(topLevelErr);
    console.error(`Oracle top-level crash: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
