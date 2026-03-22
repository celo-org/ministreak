/**
 * contracts.ts
 * Typed contract definitions for wagmi hooks.
 */

function getEnv(key: string): string {
  return (process.env[key] || "").trim();
}

export const VAULT_ADDRESS =
  (getEnv("NEXT_PUBLIC_VAULT_ADDRESS") as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const ORACLE_ADDRESS =
  (getEnv("NEXT_PUBLIC_ORACLE_ADDRESS") as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const USDT_ADDRESS =
  (getEnv("NEXT_PUBLIC_USDT_ADDRESS") as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const CHARITY_ADDRESS =
  (getEnv("NEXT_PUBLIC_CHARITY_ADDRESS") as `0x${string}`) ||
  "0x4C6Aa14F58aFb01CB0515aD33e03Ec16a67f4E55";

export const ENTRY_FEE = BigInt("500000"); // 0.50 USDT (6 decimals)

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export const VAULT_ABI = [
  {
    name: "enterRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "getCurrentRoundId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getRoundStatus",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "rounds",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "pot", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "playerCount", type: "uint256" },
    ],
  },
  {
    name: "getPlayerStats",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player", type: "address" },
    ],
    outputs: [
      { name: "streak", type: "uint8" },
      { name: "txCount", type: "uint32" },
      { name: "uniqueToCount", type: "uint16" },
      { name: "lastValidDay", type: "uint8" },
      { name: "claimed", type: "bool" },
      { name: "entered", type: "bool" },
    ],
  },
  {
    name: "getLeaderboard",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "addresses", type: "address[]" },
      { name: "streaks", type: "uint8[]" },
      { name: "txCounts", type: "uint32[]" },
      { name: "uniqueToCounts", type: "uint16[]" },
      { name: "ranks", type: "uint256[]" },
    ],
  },
  {
    name: "recordStreak",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "roundId", type: "uint256" },
      { name: "dayIndex", type: "uint8" },
      { name: "txCount", type: "uint32" },
      { name: "uniqueToCount", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "playerRecords",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "streak", type: "uint8" },
      { name: "lastValidDay", type: "uint8" },
      { name: "txCount", type: "uint32" },
      { name: "uniqueToCount", type: "uint16" },
      { name: "claimed", type: "bool" },
      { name: "entered", type: "bool" },
    ],
  },
  {
    name: "usdt",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "ENTRY_FEE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "StreakRecorded",
    type: "event",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "dayIndex", type: "uint8", indexed: false },
      { name: "txCount", type: "uint32", indexed: false },
      { name: "uniqueToCount", type: "uint16", indexed: false },
      { name: "newStreak", type: "uint8", indexed: false },
    ],
  },
  {
    name: "PlayerEntered",
    type: "event",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "pot", type: "uint256", indexed: false },
    ],
  },
  {
    name: "RoundResolved",
    type: "event",
    inputs: [
      { name: "roundId", type: "uint256", indexed: true },
      { name: "first", type: "address", indexed: true },
      { name: "second", type: "address", indexed: true },
      { name: "third", type: "address", indexed: false },
      { name: "pot", type: "uint256", indexed: false },
      { name: "protocolFee", type: "uint256", indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
