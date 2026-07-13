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
import { computeProvisional } from "./provisional";
import { writeProvisional } from "./provisionalStore";
import { awardXp, writeProfile } from "./profileStore";
import { applyFreezeCovers, freezeEnabled, type FreezeCharge } from "./freeze";
import { roundDayIndex } from "@/lib/roundDay";

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

  console.log("Oracle: scanning players (all days)...");
  const scanned = await scanAllPlayers(roundInfo, apiKey, { closedOnly: false });
  const noActivity = roundInfo.players.length - scanned.length;
  console.log(
    `Oracle: ${scanned.length} qualifying entries out of ${roundInfo.players.length} players`
  );

  if (scanned.length === 0) return { ...base, noActivity };

  // Apply the loyalty multiplier (returning players score higher). Prior rosters
  // are read on-chain once per run, independent of player count.
  const parts = await getPriorParticipants(
    publicClient,
    vaultAddress,
    roundInfo.roundId
  );
  const allWithLoyalty = applyLoyalty(scanned, (player) =>
    loyaltyMultiplierFor(player, parts)
  );

  // Write today's provisional snapshot to KV (display-only, non-fatal). The open
  // day is the day currently in progress; everything before it has closed.
  //
  // Safety invariant: the snapshot's dayIndex always equals currentDayIndex, and
  // submitted days are strictly < currentDayIndex — so the open day is never both
  // on-chain and in KV, and the additive merge can't double-count. Caveat: this
  // write is best-effort (try/catch). If it fails exactly on the run that first
  // submits a newly-closed day D, the prior snapshot (still dayIndex D) lingers
  // until the next successful write (or the 3h TTL), briefly double-adding day
  // D's score in the live view. Display-only, self-healing on the next run.
  const nowSec = Math.floor(Date.now() / 1000);
  const currentDayIndex = roundDayIndex(roundInfo.startTime, nowSec);
  if (currentDayIndex >= 0 && currentDayIndex <= 6) {
    try {
      const snapshot = computeProvisional(allWithLoyalty, currentDayIndex, roundInfo);
      await writeProvisional(snapshot);
      console.log(`Oracle: wrote provisional snapshot (day ${currentDayIndex}).`);
    } catch (e) {
      console.warn(`Oracle: provisional write failed: ${(e as Error).message}`);
    }
  }

  // Only CLOSED days are submitted on-chain (the once-only guard locks a day, so
  // we submit it after it closes and is fully rate-capped).
  const qualifying = allWithLoyalty.filter((q) => q.dayIndex < currentDayIndex);
  if (qualifying.length === 0) {
    return { ...base, noActivity };
  }

  // Award retention XP for closed active days (KV-backed, non-fatal). Idempotent
  // per player via a stored cursor, so it is safe to run on every scan.
  try {
    await awardXp(qualifying, Number(roundInfo.roundId));
  } catch (e) {
    console.warn(`Oracle: XP award failed: ${(e as Error).message}`);
  }

  // Streak-freeze (Phase 2b): bridge a returning player's single missed day with
  // a covered on-chain entry (txCount 0). Gated + non-fatal.
  let covered: typeof qualifying = [];
  let charges: FreezeCharge[] = [];
  if (freezeEnabled()) {
    try {
      ({ covered, charges } = await applyFreezeCovers(publicClient, vaultAddress, roundInfo, qualifying));
      if (covered.length) console.log(`Oracle: ${covered.length} streak-freeze cover(s) applied.`);
    } catch (e) {
      console.warn(`Oracle: freeze cover failed: ${(e as Error).message}`);
    }
  }

  // Sort by (player, dayIndex) so a covered day is always submitted before its
  // return day — the contract only extends the streak if the covered day lands
  // first (dayIndex == lastValidDay + 1).
  const toSubmit = [...qualifying, ...covered].sort(
    (a, b) =>
      a.player.toLowerCase().localeCompare(b.player.toLowerCase()) || a.dayIndex - b.dayIndex
  );

  console.log("Oracle: checking on-chain submission status...");
  const submitted = await checkAlreadySubmitted(publicClient, oracleAddress, toSubmit);
  const unsubmitted = toSubmit.filter(
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

  // The covered day is now on-chain — consume the freeze tokens. Deferred to
  // post-submit so a failed batch never burns a token without landing the cover.
  for (const c of charges) {
    try {
      await writeProfile(c.key, { ...c.profile, freezeTokens: c.profile.freezeTokens - 1, freezeUsedRound: Number(roundInfo.roundId) });
    } catch (e) {
      console.warn(`Oracle: freeze token charge failed for ${c.key}: ${(e as Error).message}`);
    }
  }

  return {
    round: Number(roundInfo.roundId),
    playersScanned: roundInfo.players.length,
    streaksSubmitted: unsubmitted.length,
    alreadySubmitted: submitted.size,
    noActivity,
    txHash,
  };
}
