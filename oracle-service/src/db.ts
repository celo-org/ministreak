/**
 * db.ts
 * SQLite database for tracking submitted streak proofs.
 * Prevents double-submits across oracle restarts.
 */

import Database from "better-sqlite3";
import { config } from "./config";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.dbPath);
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS submitted_streaks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id        TEXT    NOT NULL,
      player          TEXT    NOT NULL,
      day_index       INTEGER NOT NULL,
      tx_count        INTEGER NOT NULL,
      unique_to_count INTEGER NOT NULL,
      tx_hash         TEXT,
      submitted_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(round_id, player, day_index)
    );

    CREATE TABLE IF NOT EXISTS oracle_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  INTEGER NOT NULL,
      finished_at INTEGER,
      players_scanned INTEGER DEFAULT 0,
      streaks_submitted INTEGER DEFAULT 0,
      errors      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_submitted_round_player
      ON submitted_streaks(round_id, player);
  `);
}

export function isAlreadySubmitted(
  roundId: string,
  player: string,
  dayIndex: number
): boolean {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT 1 FROM submitted_streaks WHERE round_id = ? AND player = ? AND day_index = ?"
    )
    .get(roundId, player.toLowerCase(), dayIndex);
  return !!row;
}

export function recordSubmission(
  roundId: string,
  player: string,
  dayIndex: number,
  txCount: number,
  uniqueToCount: number,
  txHash: string
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO submitted_streaks
       (round_id, player, day_index, tx_count, unique_to_count, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(roundId, player.toLowerCase(), dayIndex, txCount, uniqueToCount, txHash);
}

export function startOracleRun(): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO oracle_runs (started_at) VALUES (strftime('%s', 'now'))")
    .run();
  return Number(result.lastInsertRowid);
}

export function finishOracleRun(
  runId: number,
  playersScanned: number,
  streaksSubmitted: number,
  errors?: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE oracle_runs
     SET finished_at = strftime('%s', 'now'),
         players_scanned = ?,
         streaks_submitted = ?,
         errors = ?
     WHERE id = ?`
  ).run(playersScanned, streaksSubmitted, errors || null, runId);
}
