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

/**
 * Returns the day windows (24h periods) from round start through the current
 * day. Each entry: { dayIndex, start (unix seconds), end (unix seconds) }.
 *
 * Windows are measured from the round's ACTUAL startTime, not from UTC
 * midnight. Rounds do not always start at midnight — `startTime` is the
 * previous round's resolution timestamp, which drifts — so aligning to
 * midnight orphaned the (partial) start day and produced zero windows while
 * the start day was still in progress, meaning no streaks were ever recorded
 * for the day players entered. day 0 = [startTime, startTime + 24h), etc.
 */
export function getRoundDayWindows(roundStartTime: bigint): Array<{
  dayIndex: number;
  start: number;
  end: number;
}> {
  const roundStart = Number(roundStartTime);
  const now = Math.floor(Date.now() / 1000);

  // Which day of the round are we currently in (0-based). Negative if the
  // round hasn't started yet.
  const currentDayIndex = Math.floor((now - roundStart) / 86400);

  const windows: Array<{ dayIndex: number; start: number; end: number }> = [];
  for (let dayIndex = 0; dayIndex <= Math.min(currentDayIndex, 6); dayIndex++) {
    const start = roundStart + dayIndex * 86400;
    windows.push({ dayIndex, start, end: start + 86400 - 1 });
  }

  return windows;
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

/**
 * Fetch all outgoing txs for an address from `sinceTimestamp` to now.
 * Paginates through Blockscout API until it hits txs older than sinceTimestamp.
 */
async function fetchOutgoingTxsSince(
  address: Address,
  sinceTimestamp: number,
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
    let foundOlder = false;

    for (const item of items) {
      const ts = Math.floor(new Date(item.timestamp).getTime() / 1000);
      if (ts < sinceTimestamp) {
        foundOlder = true;
        break;
      }
      txs.push({ to: item.to?.hash || null, timestamp: ts });
    }

    if (foundOlder || !data.next_page_params) break;
    const params = data.next_page_params;
    nextPageParams = `&block_number=${params.block_number}&index=${params.index}`;
  }

  return txs;
}

/**
 * Bucket txs into day windows and produce a QualifyingTx per day that has
 * valid outgoing (non-self-send) transactions.
 */
export function analyzePlayerTxsByDay(
  player: Address,
  txs: Array<{ to: string | null; timestamp: number }>,
  roundInfo: RoundInfo,
  dayWindows: Array<{ dayIndex: number; start: number; end: number }>
): QualifyingTx[] {
  const results: QualifyingTx[] = [];

  for (const { dayIndex, start, end } of dayWindows) {
    // Txs in this day window, excluding self-sends
    const dayTxs = txs.filter(
      (tx) =>
        tx.timestamp >= start &&
        tx.timestamp <= end &&
        tx.to &&
        tx.to.toLowerCase() !== player.toLowerCase()
    );

    if (dayTxs.length === 0) continue;

    const uniqueToAddresses = new Set<string>();
    for (const tx of dayTxs) {
      uniqueToAddresses.add(tx.to!.toLowerCase());
    }

    results.push({
      player,
      roundId: roundInfo.roundId,
      dayIndex,
      txCount: dayTxs.length,
      uniqueToCount: uniqueToAddresses.size,
    });
  }

  return results;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan all players concurrently for ALL days in the current round (not just today).
 * Self-healing: if the cron missed a day, the next run catches up.
 * Returns QualifyingTx entries per player per day with valid outgoing txs.
 * Duplicate submissions are filtered later by checkAlreadySubmitted().
 */
export async function scanAllPlayers(
  roundInfo: RoundInfo,
  apiKey: string
): Promise<QualifyingTx[]> {
  const dayWindows = getRoundDayWindows(roundInfo.startTime);

  if (dayWindows.length === 0) {
    console.log("No day windows to scan (round may not have started yet)");
    return [];
  }

  console.log(`Oracle: scanning ${dayWindows.length} day(s) in round (dayIndexes: ${dayWindows.map((d) => d.dayIndex).join(", ")})`);

  // Earliest day start is the fetch cutoff — fetch all txs since round's first UTC day
  const sinceTimestamp = dayWindows[0].start;

  const results = await Promise.allSettled(
    roundInfo.players.map(async (player) => {
      const txs = await fetchOutgoingTxsSince(player, sinceTimestamp, apiKey);
      if (txs.length === 0) return [];
      return analyzePlayerTxsByDay(player, txs, roundInfo, dayWindows);
    })
  );

  const qualifying: QualifyingTx[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      qualifying.push(...result.value);
    } else if (result.status === "rejected") {
      console.warn(`Player scan failed: ${result.reason}`);
    }
  }

  return qualifying;
}
