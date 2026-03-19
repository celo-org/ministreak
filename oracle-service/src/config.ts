import * as dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  privateKey: required("ORACLE_PRIVATE_KEY") as `0x${string}`,
  rpcUrl: process.env.CELO_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
  vaultAddress: required("VAULT_ADDRESS") as `0x${string}`,
  oracleAddress: required("ORACLE_ADDRESS") as `0x${string}`,
  dbPath: process.env.DB_PATH || "./oracle.db",
  webhookUrl: process.env.WEBHOOK_ALERT_URL || "",
  minCeloBalance: parseFloat(process.env.MIN_CELO_BALANCE || "0.1"),
  blocksLookback: parseInt(process.env.BLOCKS_LOOKBACK || "720"),
  cronSchedule: process.env.CRON_SCHEDULE || "0 * * * *",
  logLevel: process.env.LOG_LEVEL || "info",
};

export type Config = typeof config;
