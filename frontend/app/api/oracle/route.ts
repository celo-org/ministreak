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
import { runOracleScan } from "@/lib/oracle/run";
import { CELO_RPC_URL } from "@/lib/contracts";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro plan

export async function GET(request: Request) {
  try {
    // ─── Auth: verify Vercel Cron secret ─────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ─── Config from env ─────────────────────────────────────────────────────
    const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address;
    const oracleAddress = process.env.NEXT_PUBLIC_ORACLE_ADDRESS as Address;
    const rpcUrl = CELO_RPC_URL;
    const privateKey = process.env.ORACLE_PRIVATE_KEY as `0x${string}`;
    const apiKey = process.env.BLOCKSCOUT_API_KEY || "";

    if (!vaultAddress || !oracleAddress || !privateKey) {
      return NextResponse.json(
        { error: "Missing required env vars (VAULT_ADDRESS, ORACLE_ADDRESS, ORACLE_PRIVATE_KEY)" },
        { status: 500 }
      );
    }

    // ─── Viem clients ────────────────────────────────────────────────────────
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

    // ─── Oracle run ──────────────────────────────────────────────────────────
    try {
      const result = await runOracleScan(
        publicClient as unknown as PublicClient,
        walletClient as unknown as WalletClient,
        { vaultAddress, oracleAddress, apiKey }
      );
      return NextResponse.json({ ok: true, ...result, errors: [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Oracle run failed: ${msg}`);
      return NextResponse.json({ ok: false, error: msg, errors: [msg] }, { status: 500 });
    }
  } catch (topLevelErr) {
    const msg = topLevelErr instanceof Error ? topLevelErr.message : String(topLevelErr);
    console.error(`Oracle top-level crash: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
