/**
 * run.ts
 * Shared oracle scan+submit routine.
 *
 * Used by both the /api/oracle cron and /api/resolve. The resolve route runs a
 * final scan immediately before resolving, so a round never resolves on stale
 * streak data (closes the endTime-drift and boundary-failure gaps).
 *
 * Idempotent: already-submitted streaks are filtered via an on-chain multicall,
 * so running it twice in quick succession only submits newly-qualifying days.
 */

import type { Address, PublicClient, WalletClient } from "viem";
import { getCurrentRound, scanAllPlayers } from "./scanner";
import { checkAlreadySubmitted, batchSubmitStreaks } from "./submitter";
import { getPriorParticipants, loyaltyMultiplierFor, applyLoyalty } from "./loyalty";

export interface OracleRunResult {
  round: number;
  playersScanned: number;
  streaksSubmitted: number;
  alreadySubmitted: number;
  noActivity: number;
  txHash?: string;
}

export async function runOracleScan(
  publicClient: PublicClient,
  walletClient: WalletClient,
  opts: { vaultAddress: Address; oracleAddress: Address; apiKey: string }
): Promise<OracleRunResult> {
  const { vaultAddress, oracleAddress, apiKey } = opts;

  console.log("Oracle: fetching current round...");
  const roundInfo = await getCurrentRound(publicClient, vaultAddress);
  console.log(
    `Oracle: round ${roundInfo.roundId}, ${roundInfo.players.length} players`
  );

  const base: OracleRunResult = {
    round: Number(roundInfo.roundId),
    playersScanned: roundInfo.players.length,
    streaksSubmitted: 0,
    alreadySubmitted: 0,
    noActivity: 0,
  };

  if (roundInfo.players.length === 0) return base;

  console.log("Oracle: scanning players...");
  const scanned = await scanAllPlayers(roundInfo, apiKey);
  const noActivity = roundInfo.players.length - scanned.length;
  console.log(
    `Oracle: ${scanned.length} qualifying out of ${roundInfo.players.length}`
  );

  if (scanned.length === 0) return { ...base, noActivity };

  // Apply the loyalty multiplier (returning players score higher). Prior rosters
  // are read on-chain once per run, independent of player count.
  const parts = await getPriorParticipants(
    publicClient,
    vaultAddress,
    roundInfo.roundId
  );
  const qualifying = applyLoyalty(scanned, (player) =>
    loyaltyMultiplierFor(player, parts)
  );

  console.log("Oracle: checking on-chain submission status...");
  const submitted = await checkAlreadySubmitted(
    publicClient,
    oracleAddress,
    qualifying
  );
  const unsubmitted = qualifying.filter(
    (q) => !submitted.has(`${q.player.toLowerCase()}:${q.roundId}:${q.dayIndex}`)
  );
  console.log(
    `Oracle: ${submitted.size} already submitted, ${unsubmitted.length} new`
  );

  if (unsubmitted.length === 0) {
    return { ...base, alreadySubmitted: submitted.size, noActivity };
  }

  console.log(`Oracle: batch submitting ${unsubmitted.length} streaks...`);
  const txHash = await batchSubmitStreaks(
    walletClient,
    publicClient,
    oracleAddress,
    unsubmitted
  );
  console.log(`Oracle: batch submitted. Tx: ${txHash}`);

  return {
    round: Number(roundInfo.roundId),
    playersScanned: roundInfo.players.length,
    streaksSubmitted: unsubmitted.length,
    alreadySubmitted: submitted.size,
    noActivity,
    txHash,
  };
}
