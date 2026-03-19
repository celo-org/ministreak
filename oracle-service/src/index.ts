/**
 * index.ts
 * Main entry point for the MiniStreak Oracle Service.
 *
 * Runs on a cron schedule (default: every hour).
 * Each run:
 *   1. Checks oracle wallet CELO balance (alerts if low)
 *   2. Fetches current round and all registered players
 *   3. Scans each player's outgoing transactions for today
 *   4. Submits qualifying streak proofs to StreakOracle.sol
 *   5. Logs all submissions to SQLite to avoid double-submits
 */

import cron from "node-cron";
import { config } from "./config";
import { log } from "./logger";
import { isAlreadySubmitted, recordSubmission, startOracleRun, finishOracleRun } from "./db";
import { getCurrentRound, scanAllPlayers, type QualifyingTx } from "./scanner";
import { submitStreak, checkAndAlertBalance } from "./submitter";

// ─── Main Oracle Run ──────────────────────────────────────────────────────────

async function runOracle(): Promise<void> {
  log.info("=== Oracle run started ===");
  const runId = startOracleRun();
  let playersScanned = 0;
  let streaksSubmitted = 0;
  const errors: string[] = [];

  try {
    // 1. Check wallet balance
    await checkAndAlertBalance();

    // 2. Fetch current round
    const roundInfo = await getCurrentRound();
    log.info(
      `Round ${roundInfo.roundId}: ${roundInfo.players.length} players registered`
    );

    if (roundInfo.players.length === 0) {
      log.info("No players in current round, nothing to scan.");
      finishOracleRun(runId, 0, 0);
      return;
    }

    playersScanned = roundInfo.players.length;

    // 3. Scan all players for today's qualifying txn
    const qualifying: QualifyingTx[] = await scanAllPlayers(
      roundInfo,
      isAlreadySubmitted
    );

    log.info(`Found ${qualifying.length} new qualifying txns to submit`);

    // 4. Submit each qualifying txn individually
    //    (could batch, but individual gives better retry granularity)
    for (const q of qualifying) {
      try {
        const txHash = await submitStreak(q);

        // 5. Record in SQLite
        recordSubmission(
          q.roundId.toString(),
          q.player,
          q.dayIndex,
          q.txCount,
          q.uniqueToCount,
          txHash
        );

        streaksSubmitted++;
        log.info(
          `[${streaksSubmitted}/${qualifying.length}] Streak recorded: ` +
          `player=${q.player}, day=${q.dayIndex}, tx=${txHash}`
        );
      } catch (err) {
        const msg = `Failed to submit streak for ${q.player} day ${q.dayIndex}: ${err}`;
        log.error(msg);
        errors.push(msg);
      }
    }
  } catch (err) {
    const msg = `Fatal oracle run error: ${err}`;
    log.error(msg);
    errors.push(msg);
  } finally {
    finishOracleRun(
      runId,
      playersScanned,
      streaksSubmitted,
      errors.length > 0 ? errors.join("\n") : undefined
    );
    log.info(
      `=== Oracle run complete: ${streaksSubmitted} streaks submitted, ${errors.length} errors ===`
    );
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

log.info(`MiniStreak Oracle Service starting...`);
log.info(`Vault:   ${config.vaultAddress}`);
log.info(`Oracle:  ${config.oracleAddress}`);
log.info(`RPC:     ${config.rpcUrl}`);
log.info(`Cron:    ${config.cronSchedule}`);
log.info(`DB:      ${config.dbPath}`);

// Run immediately on startup
runOracle();

// Then schedule via cron
cron.schedule(config.cronSchedule, () => {
  runOracle();
});

log.info(`Oracle cron scheduled: ${config.cronSchedule}`);
