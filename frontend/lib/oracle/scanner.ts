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
import { DAY, effectiveRoundStart } from "@/lib/roundDay";
import { rateCapTxs } from "./rateCap";
import { RATE_WINDOW_SECONDS } from "./scoreConfig";

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
  vaultAddress: Address;
}

// ─── ABIs ────────────────────────────────────────────────────────────────────

const VAULT_ABI = parseAbi([
  "function getCurrentRoundId() external view returns (uint256)",
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
  "function rounds(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 pot, uint8 status, uint256 playerCount)",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BLOCKSCOUT_API = "https://celo.blockscout.com/api/v2";
// Etherscan V2 multichain API — Celo mainnet via chainid=42220. Used as a
// second source: Blockscout has been observed dropping all txs in an indexed
// block (a hole), which silently loses a player's streak since the oracle read
// only Blockscout. We union both sources so a gap in either still counts.
const ETHERSCAN_API = "https://api.etherscan.io/v2/api";
const CELO_CHAIN_ID = 42220;

type RawTx = {
  hash: string;
  to: string | null;
  timestamp: number;
  method: string | null;
};

/**
 * Returns the day windows (24h periods) from round start through the current
 * day. Each entry: { dayIndex, start (unix seconds), end (unix seconds) }.
 *
 * Windows are measured from the round's EFFECTIVE start (see roundDay.ts):
 * a near-midnight start snaps to that UTC midnight, so day 0 = a calendar day
 * and streak-days roll at 00:00 UTC. A far-from-midnight (legacy mid-day)
 * start passes through unchanged, so day 0 = [startTime, startTime + 24h) and
 * the entry day still gets scanned (this fixed the earlier "streak stuck at 0"
 * bug for rounds that started mid-day).
 */
export function getRoundDayWindows(
  roundStartTime: bigint,
  opts: { closedOnly?: boolean } = {}
): Array<{
  dayIndex: number;
  start: number;
  end: number;
}> {
  const base = effectiveRoundStart(roundStartTime);
  const now = Math.floor(Date.now() / 1000);

  // Which day of the round are we currently in (0-based). Negative if the
  // round hasn't started yet.
  const currentDayIndex = Math.floor((now - base) / DAY);

  const windows: Array<{ dayIndex: number; start: number; end: number }> = [];
  for (let dayIndex = 0; dayIndex <= Math.min(currentDayIndex, 6); dayIndex++) {
    const start = base + dayIndex * DAY;
    const end = start + DAY - 1;
    // Submit a day's Score only after it closes, so the full day is rate-capped
    // before the on-chain once-only guard locks it in. The live "Today's in"
    // feel is handled client-side (optimistic UI).
    if (opts.closedOnly && end >= now) continue;
    windows.push({ dayIndex, start, end });
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

  return { roundId, startTime, endTime, players, vaultAddress };
}

// ─── Transaction Scanning (Blockscout + Etherscan, unioned) ──────────────────

/**
 * Fetch outgoing txs for an address since `sinceTimestamp`, from BOTH Blockscout
 * and Etherscan, unioned by tx hash. If either provider has a gap (e.g. a
 * Blockscout block with missing txs), the other still supplies the tx, so a
 * player's streak isn't silently dropped. Each source is best-effort: if one
 * errors (or Etherscan has no API key), the other's results are still used.
 */
async function fetchOutgoingTxsSince(
  address: Address,
  sinceTimestamp: number,
  apiKey: string
): Promise<RawTx[]> {
  const [bs, es] = await Promise.allSettled([
    fetchFromBlockscout(address, sinceTimestamp, apiKey),
    fetchFromEtherscan(address, sinceTimestamp),
  ]);
  const bsTxs = bs.status === "fulfilled" ? bs.value : [];
  const esTxs = es.status === "fulfilled" ? es.value : [];

  const byHash = new Map<string, RawTx>();
  for (const t of bsTxs) if (t.hash) byHash.set(t.hash.toLowerCase(), t);
  for (const t of esTxs) if (t.hash) byHash.set(t.hash.toLowerCase(), t);
  return [...byHash.values()];
}

/**
 * Fetch outgoing txs from Blockscout, paginating until older than sinceTimestamp.
 */
async function fetchFromBlockscout(
  address: Address,
  sinceTimestamp: number,
  apiKey: string
): Promise<RawTx[]> {
  const txs: RawTx[] = [];
  let nextPageParams: string | null = null;

  while (true) {
    const baseUrl = `${BLOCKSCOUT_API}/addresses/${address}/transactions?filter=from`;
    const url = nextPageParams
      ? `${baseUrl}${nextPageParams}&apikey=${apiKey}`
      : `${baseUrl}&apikey=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`Blockscout API error for ${address}: ${res.status}`);
      break;
    }

    const data: {
      items: Array<{ hash: string; timestamp: string; to?: { hash: string }; method?: string | null }>;
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
      txs.push({
        hash: item.hash,
        to: item.to?.hash || null,
        timestamp: ts,
        method: item.method ?? null,
      });
    }

    if (foundOlder || !data.next_page_params) break;
    const params = data.next_page_params;
    nextPageParams = `&block_number=${params.block_number}&index=${params.index}`;
  }

  return txs;
}

/**
 * Fetch outgoing txs from the Etherscan V2 API (Celo, chainid 42220). No-op when
 * ETHERSCAN_API_KEY is unset. Returns [] on any error so it can only ADD to the
 * union, never break the scan.
 */
async function fetchFromEtherscan(
  address: Address,
  sinceTimestamp: number
): Promise<RawTx[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];

  const url =
    `${ETHERSCAN_API}?chainid=${CELO_CHAIN_ID}&module=account&action=txlist` +
    `&address=${address}&startblock=0&endblock=99999999&sort=desc&page=1&offset=1000&apikey=${key}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`Etherscan API error for ${address}: ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      status: string;
      result: unknown;
    };
    // status "0" (e.g. "No transactions found" / rate limit) -> treat as empty.
    if (data.status !== "1" || !Array.isArray(data.result)) return [];

    const out: RawTx[] = [];
    for (const t of data.result as Array<Record<string, string>>) {
      // Outgoing only (txlist returns both directions).
      if ((t.from || "").toLowerCase() !== address.toLowerCase()) continue;
      const ts = parseInt(t.timeStamp, 10);
      if (ts < sinceTimestamp) break; // sorted desc
      out.push({
        hash: t.hash,
        to: t.to && t.to !== "" ? t.to : null,
        timestamp: ts,
        method: t.functionName ? t.functionName.split("(")[0] : null,
      });
    }
    return out;
  } catch (e) {
    console.warn(`Etherscan fetch failed for ${address}: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Bucket txs into day windows and produce a QualifyingTx per day.
 *
 * txCount counts only outgoing (non-self-send) txs *strictly after* the
 * player's entry. The entry itself is already counted on-chain (enterRound
 * sets txCount = 1), so pre-entry txs — the ERC-20 `approve`, and any
 * prior-round `claimRefund` that lands in the entry-day window — are excluded
 * and the entry isn't double-counted. The entry is detected as the
 * `enterRound` tx to the vault.
 *
 * The entry day always yields a QualifyingTx (even with 0 post-entry txs) so
 * it still counts toward the streak — entering is the day's activity.
 *
 * If no entry tx is found (defensive fallback), the old behaviour applies:
 * count every in-window tx.
 */
export function analyzePlayerTxsByDay(
  player: Address,
  txs: Array<{ to: string | null; timestamp: number; method?: string | null }>,
  roundInfo: RoundInfo,
  dayWindows: Array<{ dayIndex: number; start: number; end: number }>
): QualifyingTx[] {
  const vault = roundInfo.vaultAddress.toLowerCase();
  const entryTx = txs.find(
    (tx) => tx.method === "enterRound" && tx.to?.toLowerCase() === vault
  );
  const hasEntry = entryTx !== undefined;
  const entryTime = entryTx ? entryTx.timestamp : -Infinity;
  const entryDayIndex = hasEntry
    ? dayWindows.find((w) => entryTime >= w.start && entryTime <= w.end)?.dayIndex
    : undefined;

  const results: QualifyingTx[] = [];

  for (const { dayIndex, start, end } of dayWindows) {
    const inWindow = txs.filter(
      (tx) =>
        tx.timestamp >= start &&
        tx.timestamp <= end &&
        tx.to &&
        tx.to.toLowerCase() !== player.toLowerCase()
    );
    // Only txs strictly after entry count (entry already counted on-chain).
    const dayTxs = hasEntry
      ? inWindow.filter((tx) => tx.timestamp > entryTime)
      : inWindow;

    const isEntryDay = hasEntry && dayIndex === entryDayIndex;
    if (dayTxs.length === 0 && !isEntryDay) continue;

    // Anti-farm: count at most one tx per RATE_WINDOW_SECONDS. uniqueToCount is
    // measured over the SAME capped set so both tiebreakers derive from one
    // consistent set (closes the alt-spam hole on the tertiary key).
    const counted = rateCapTxs(dayTxs, RATE_WINDOW_SECONDS);
    const uniqueToAddresses = new Set<string>();
    for (const tx of counted) {
      uniqueToAddresses.add(tx.to!.toLowerCase());
    }

    results.push({
      player,
      roundId: roundInfo.roundId,
      dayIndex,
      txCount: counted.length,
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
  apiKey: string,
  opts: { closedOnly?: boolean } = {}
): Promise<QualifyingTx[]> {
  const { closedOnly = true } = opts;
  const dayWindows = getRoundDayWindows(roundInfo.startTime, { closedOnly });

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
