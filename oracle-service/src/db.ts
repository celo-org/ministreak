import { config } from "./config";
import * as fs from "fs";
import * as path from "path";

interface StreakRecord {
  roundId: string;
  player: string;
  dayIndex: number;
  txCount: number;
  uniqueToCount: number;
  txHash: string;
  submittedAt: number;
}

interface OracleRun {
  id: number;
  startedAt: number;
  finishedAt?: number;
  playersScanned: number;
  streaksSubmitted: number;
  errors?: string;
}

interface DbStore {
  streaks: StreakRecord[];
  runs: OracleRun[];
  nextRunId: number;
}

let store: DbStore = {
  streaks: [],
  runs: [],
  nextRunId: 1,
};

function getDbPath(): string {
  return path.resolve(config.dbPath.replace(".db", ".json"));
}

function loadStore(): void {
  const filePath = getDbPath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      store = JSON.parse(data);
    } catch {
      store = { streaks: [], runs: [], nextRunId: 1 };
    }
  }
}

function saveStore(): void {
  const filePath = getDbPath();
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export function getDb(): DbStore {
  loadStore();
  return store;
}

export function isAlreadySubmitted(
  roundId: string,
  player: string,
  dayIndex: number
): boolean {
  const s = getDb();
  return s.streaks.some(
    (r) =>
      r.roundId === roundId &&
      r.player === player.toLowerCase() &&
      r.dayIndex === dayIndex
  );
}

export function recordSubmission(
  roundId: string,
  player: string,
  dayIndex: number,
  txCount: number,
  uniqueToCount: number,
  txHash: string
): void {
  const s = getDb();
  const exists = s.streaks.some(
    (r) =>
      r.roundId === roundId &&
      r.player === player.toLowerCase() &&
      r.dayIndex === dayIndex
  );
  if (!exists) {
    s.streaks.push({
      roundId,
      player: player.toLowerCase(),
      dayIndex,
      txCount,
      uniqueToCount,
      txHash,
      submittedAt: Math.floor(Date.now() / 1000),
    });
    saveStore();
  }
}

export function startOracleRun(): number {
  const s = getDb();
  const id = s.nextRunId++;
  s.runs.push({ id, startedAt: Math.floor(Date.now() / 1000), playersScanned: 0, streaksSubmitted: 0 });
  saveStore();
  return id;
}

export function finishOracleRun(
  runId: number,
  playersScanned: number,
  streaksSubmitted: number,
  errors?: string
): void {
  const s = getDb();
  const run = s.runs.find((r) => r.id === runId);
  if (run) {
    run.finishedAt = Math.floor(Date.now() / 1000);
    run.playersScanned = playersScanned;
    run.streaksSubmitted = streaksSubmitted;
    run.errors = errors;
    saveStore();
  }
}
