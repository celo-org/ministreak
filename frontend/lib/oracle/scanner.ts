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

function getTodayUTCWindow(): { start: number; end: number } {
  const now = Date.now();
  const startOfDay = Math.floor(now / 86400000) * 86400;
  return { start: startOfDay, end: startOfDay + 86399 };
}

function getDayIndex(todayStartTimestamp: bigint, roundStartTime: bigint): number {
  const secondsIntoRound = Number(todayStartTimestamp - roundStartTime);
  return Math.floor(secondsIntoRound / 86400);
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

async function fetchOutgoingTxsToday(
  address: Address,
  todayStart: number,
  todayEnd: number,
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
    let foundOlderThanToday = false;

    for (const item of items) {
      const ts = Math.floor(new Date(item.timestamp).getTime() / 1000);
      if (ts < todayStart) {
        foundOlderThanToday = true;
        break;
      }
      if (ts >= todayStart && ts <= todayEnd) {
        txs.push({ to: item.to?.hash || null, timestamp: ts });
      }
    }

    if (foundOlderThanToday || !data.next_page_params) break;
    const params = data.next_page_params;
    nextPageParams = `&block_number=${params.block_number}&index=${params.index}`;
  }

  return txs;
}

function analyzePlayerTxs(
  player: Address,
  txs: Array<{ to: string | null; timestamp: number }>,
  roundInfo: RoundInfo,
  dayIndex: number
): QualifyingTx | null {
  // Filter out self-sends
  const validTxs = txs.filter(
    (tx) => tx.to && tx.to.toLowerCase() !== player.toLowerCase()
  );

  if (validTxs.length === 0) return null;

  const uniqueToAddresses = new Set<string>();
  for (const tx of validTxs) {
    uniqueToAddresses.add(tx.to!.toLowerCase());
  }

  return {
    player,
    roundId: roundInfo.roundId,
    dayIndex,
    txCount: validTxs.length,
    uniqueToCount: uniqueToAddresses.size,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scan all players concurrently for today's qualifying transactions.
 * Returns only players who have valid outgoing txs today (not self-sends).
 */
export async function scanAllPlayers(
  roundInfo: RoundInfo,
  apiKey: string
): Promise<QualifyingTx[]> {
  const { start: todayStart, end: todayEnd } = getTodayUTCWindow();
  const dayIndex = getDayIndex(BigInt(todayStart), roundInfo.startTime);

  if (dayIndex < 0 || dayIndex > 6) {
    console.log(`dayIndex ${dayIndex} out of range (0-6), skipping scan`);
    return [];
  }

  const results = await Promise.allSettled(
    roundInfo.players.map(async (player) => {
      const txs = await fetchOutgoingTxsToday(player, todayStart, todayEnd, apiKey);
      if (txs.length === 0) return null;
      return analyzePlayerTxs(player, txs, roundInfo, dayIndex);
    })
  );

  const qualifying: QualifyingTx[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      qualifying.push(result.value);
    } else if (result.status === "rejected") {
      console.warn(`Player scan failed: ${result.reason}`);
    }
  }

  return qualifying;
}
