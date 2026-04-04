/**
 * submitter.ts
 * Checks on-chain submission status via multicall and batch-submits
 * qualifying streaks to StreakOracle.
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  parseAbi,
} from "viem";
import type { QualifyingTx } from "./scanner";

const ORACLE_ABI = parseAbi([
  "function batchSubmitStreaks(address[] calldata players, uint256[] calldata roundIds, uint8[] calldata dayIndexes, uint32[] calldata txCounts, uint16[] calldata uniqueToCounts) external",
  "function isSubmitted(address player, uint256 roundId, uint256 dayIndex) external view returns (bool)",
]);

/**
 * Check which qualifying txs have already been submitted on-chain.
 * Uses viem multicall for a single RPC round-trip.
 * Returns a Set of player addresses that are already submitted.
 */
export async function checkAlreadySubmitted(
  client: PublicClient,
  oracleAddress: Address,
  qualifyingTxs: QualifyingTx[]
): Promise<Set<string>> {
  if (qualifyingTxs.length === 0) return new Set();

  const calls = qualifyingTxs.map((q) => ({
    address: oracleAddress,
    abi: ORACLE_ABI,
    functionName: "isSubmitted" as const,
    args: [q.player, q.roundId, BigInt(q.dayIndex)] as const,
  }));

  const results = await client.multicall({ contracts: calls });

  const alreadySubmitted = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "success" && results[i].result === true) {
      alreadySubmitted.add(qualifyingTxs[i].player.toLowerCase());
    }
  }

  return alreadySubmitted;
}

/**
 * Batch-submit all qualifying streaks in a single on-chain transaction.
 * Returns the transaction hash.
 */
export async function batchSubmitStreaks(
  walletClient: WalletClient,
  publicClient: PublicClient,
  oracleAddress: Address,
  qualifyingTxs: QualifyingTx[]
): Promise<string> {
  const players = qualifyingTxs.map((q) => q.player);
  const roundIds = qualifyingTxs.map((q) => q.roundId);
  const dayIndexes = qualifyingTxs.map((q) => q.dayIndex);
  const txCounts = qualifyingTxs.map((q) => q.txCount);
  const uniqueToCounts = qualifyingTxs.map((q) => q.uniqueToCount);

  // Fetch gas price with 30% buffer for mainnet
  const gasPrice = await publicClient.getGasPrice();
  const gasPriceWithBuffer = (gasPrice * BigInt(130)) / BigInt(100);

  const hash = await (walletClient.writeContract as any)({
    address: oracleAddress,
    abi: ORACLE_ABI,
    functionName: "batchSubmitStreaks",
    args: [players, roundIds, dayIndexes, txCounts, uniqueToCounts],
    gasPrice: gasPriceWithBuffer,
  });

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Batch submit tx ${hash} failed (status: ${receipt.status})`);
  }

  return hash;
}
