/**
 * submitter.ts
 * Signs and submits streak proofs to the StreakOracle smart contract.
 * Uses viem with legacy transaction mode (required for Celo).
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { config } from "./config";
import { log } from "./logger";
import type { QualifyingTx } from "./scanner";

const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
    public: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
});

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const ORACLE_ABI = parseAbi([
  "function submitStreak(address player, uint256 roundId, uint8 dayIndex, uint32 txCount, uint16 uniqueToCount) external",
  "function batchSubmitStreaks(address[] calldata players, uint256[] calldata roundIds, uint8[] calldata dayIndexes, uint32[] calldata txCounts, uint16[] calldata uniqueToCounts) external",
  "function isSubmitted(address player, uint256 roundId, uint256 dayIndex) external view returns (bool)",
]);

// ─── Clients ──────────────────────────────────────────────────────────────────

let walletClient: ReturnType<typeof createWalletClient> | null = null;
let publicClient: ReturnType<typeof createPublicClient> | null = null;

function getClients() {
  if (!walletClient || !publicClient) {
    const account = privateKeyToAccount(
      config.privateKey.startsWith("0x")
        ? (config.privateKey as `0x${string}`)
        : (`0x${config.privateKey}` as `0x${string}`)
    );

    publicClient = createPublicClient({
      chain: celoSepolia,
      transport: http(config.rpcUrl),
    });

    walletClient = createWalletClient({
      account,
      chain: celoSepolia,
      transport: http(config.rpcUrl),
    });
  }

  return { walletClient, publicClient };
}

// ─── Balance Check & Alert ────────────────────────────────────────────────────

/**
 * Check oracle wallet CELO balance and send a webhook alert if low.
 */
export async function checkAndAlertBalance(): Promise<void> {
  const { publicClient, walletClient } = getClients();
  const account = walletClient.account!;

  const balanceWei = await publicClient.getBalance({ address: account.address });
  const balanceCelo = parseFloat(formatEther(balanceWei));

  log.info(`Oracle wallet ${account.address}: ${balanceCelo.toFixed(4)} CELO`);

  if (balanceCelo < config.minCeloBalance && config.webhookUrl) {
    await sendAlert(
      `[MiniStreak Oracle] LOW BALANCE WARNING\n` +
      `Wallet: ${account.address}\n` +
      `Balance: ${balanceCelo.toFixed(4)} CELO\n` +
      `Minimum: ${config.minCeloBalance} CELO\n` +
      `Please top up the oracle wallet to continue submitting streak proofs.`
    );
  }
}

async function sendAlert(message: string): Promise<void> {
  if (!config.webhookUrl) return;
  try {
    await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (err) {
    log.warn(`Failed to send webhook alert: ${err}`);
  }
}

// ─── Submission ───────────────────────────────────────────────────────────────

/**
 * Submit a single streak proof.
 * Uses legacy transaction mode (no EIP-1559) as required by Celo.
 */
export async function submitStreak(qualifying: QualifyingTx): Promise<string> {
  const { walletClient, publicClient } = getClients();

  log.info(
    `Submitting streak: player=${qualifying.player}, round=${qualifying.roundId}, ` +
    `day=${qualifying.dayIndex}, txCount=${qualifying.txCount}, uniqueTo=${qualifying.uniqueToCount}`
  );

  // Simulate first to catch reverts early
  await publicClient.simulateContract({
    address: config.oracleAddress,
    abi: ORACLE_ABI,
    functionName: "submitStreak",
    args: [
      qualifying.player,
      qualifying.roundId,
      BigInt(qualifying.dayIndex),
      qualifying.txCount,
      qualifying.uniqueToCount,
    ],
    account: walletClient.account!,
  });

  const hash = await walletClient.writeContract({
    address: config.oracleAddress,
    abi: ORACLE_ABI,
    functionName: "submitStreak",
    args: [
      qualifying.player,
      qualifying.roundId,
      BigInt(qualifying.dayIndex),
      qualifying.txCount,
      qualifying.uniqueToCount,
    ],
    // Legacy tx mode for Celo (no maxFeePerGas / maxPriorityFeePerGas)
    gasPrice: BigInt(5_000_000_000), // 5 gwei
  });

  log.info(`Streak submitted. Tx: ${hash}`);

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Tx ${hash} failed (status: ${receipt.status})`);
  }

  return hash;
}

/**
 * Batch submit multiple streak proofs in a single transaction.
 * More gas-efficient when multiple players qualify simultaneously.
 */
export async function batchSubmitStreaks(
  qualifyingList: QualifyingTx[]
): Promise<string> {
  const { walletClient, publicClient } = getClients();

  if (qualifyingList.length === 0) {
    throw new Error("Empty batch");
  }

  const players = qualifyingList.map((q) => q.player);
  const roundIds = qualifyingList.map((q) => q.roundId);
  const dayIndexes = qualifyingList.map((q) => BigInt(q.dayIndex));
  const txCounts = qualifyingList.map((q) => q.txCount);
  const uniqueToCounts = qualifyingList.map((q) => q.uniqueToCount);

  log.info(`Batch submitting ${qualifyingList.length} streak proofs...`);

  const hash = await walletClient.writeContract({
    address: config.oracleAddress,
    abi: ORACLE_ABI,
    functionName: "batchSubmitStreaks",
    args: [players, roundIds, dayIndexes, txCounts, uniqueToCounts],
    gasPrice: BigInt(5_000_000_000),
  });

  log.info(`Batch submitted. Tx: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Batch tx ${hash} failed`);
  }

  return hash;
}
