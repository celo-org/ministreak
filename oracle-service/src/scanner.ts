import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { defineChain } from "viem";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
    public: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
});
import { config } from "./config";
import { log } from "./logger";

const BLOCKSCOUT_API = "https://celo-sepolia.blockscout.com/api/v2";

const VAULT_ABI = parseAbi([
  "function getCurrentRoundId() external view returns (uint256)",
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
  "function rounds(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 pot, uint8 status, uint256 playerCount)",
]);

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

let client: PublicClient | null = null;

function getClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: celoSepolia,
      transport: http(config.rpcUrl),
    }) as PublicClient;
  }
  return client;
}

function getDayIndex(timestamp: bigint, roundStartTime: bigint): number {
  const secondsIntoRound = Number(timestamp - roundStartTime);
  return Math.floor(secondsIntoRound / 86400);
}

function getTodayUTCWindow(): { start: number; end: number } {
  const now = Date.now();
  const startOfDay = Math.floor(now / 86400000) * 86400;
  return {
    start: startOfDay,
    end: startOfDay + 86399,
  };
}

export async function getCurrentRound(): Promise<RoundInfo> {
  const c = getClient();

  const roundId = await c.readContract({
    address: config.vaultAddress,
    abi: VAULT_ABI,
    functionName: "getCurrentRoundId",
  });

  const [startTime, endTime] = await c.readContract({
    address: config.vaultAddress,
    abi: VAULT_ABI,
    functionName: "rounds",
    args: [roundId],
  }) as [bigint, bigint, bigint, number, bigint];

  const players = await c.readContract({
    address: config.vaultAddress,
    abi: VAULT_ABI,
    functionName: "getRoundPlayers",
    args: [roundId],
  }) as Address[];

  log.info(`Current round: ${roundId}, players: ${players.length}`);
  return { roundId, startTime, endTime, players };
}

async function fetchOutgoingTxs(
  address: Address,
  todayStart: number,
  todayEnd: number
): Promise<Array<{ to: string | null; timestamp: number }>> {
  const txs: Array<{ to: string | null; timestamp: number }> = [];
  let nextPageParams: string | null = null;

  while (true) {
    const url: string = nextPageParams
      ? `${BLOCKSCOUT_API}/addresses/${address}/transactions?filter=from${nextPageParams}`
      : `${BLOCKSCOUT_API}/addresses/${address}/transactions?filter=from`;

    const res: Response = await fetch(url);
    if (!res.ok) {
      log.warn(`Blockscout API error for ${address}: ${res.status}`);
      break;
    }

    const data: { items: Array<{ timestamp: string; to?: { hash: string } }>; next_page_params?: { block_number: string; index: number } } = await res.json();
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

    const params: { block_number: string; index: number } = data.next_page_params;
    nextPageParams = `&block_number=${params.block_number}&index=${params.index}`;
  }

  return txs;
}

export async function scanPlayerToday(
  player: Address,
  roundInfo: RoundInfo
): Promise<QualifyingTx | null> {
  const { roundId, startTime } = roundInfo;
  const { start: todayStart, end: todayEnd } = getTodayUTCWindow();

  const dayIndex = getDayIndex(BigInt(todayStart), startTime);
  if (dayIndex < 0 || dayIndex > 6) {
    log.debug(`Player ${player}: dayIndex ${dayIndex} out of range, skipping`);
    return null;
  }

  const txs = await fetchOutgoingTxs(player, todayStart, todayEnd);

  if (txs.length === 0) {
    log.debug(`Player ${player}: no outgoing txs found today`);
    return null;
  }

  const uniqueToAddresses = new Set<string>();
  for (const tx of txs) {
    if (tx.to) {
      uniqueToAddresses.add(tx.to.toLowerCase());
    }
  }

  log.info(
    `Player ${player}: ${txs.length} txs, ${uniqueToAddresses.size} unique addrs, day=${dayIndex}`
  );

  return {
    player,
    roundId,
    dayIndex,
    txCount: txs.length,
    uniqueToCount: uniqueToAddresses.size,
  };
}

export async function scanAllPlayers(
  roundInfo: RoundInfo,
  isAlreadySubmitted: (roundId: string, player: string, dayIndex: number) => boolean
): Promise<QualifyingTx[]> {
  const results: QualifyingTx[] = [];

  for (const player of roundInfo.players) {
    try {
      const qualifying = await scanPlayerToday(player, roundInfo);
      if (!qualifying) continue;

      if (isAlreadySubmitted(roundInfo.roundId.toString(), player, qualifying.dayIndex)) {
        log.debug(`Player ${player} day ${qualifying.dayIndex}: already submitted, skipping`);
        continue;
      }

      results.push(qualifying);
    } catch (err) {
      log.warn(`Error scanning player ${player}: ${err}`);
    }
  }

  return results;
}
