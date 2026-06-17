/**
 * contracts.ts
 * Typed contract definitions for wagmi hooks.
 *
 * IMPORTANT: Next.js only inlines NEXT_PUBLIC_* env vars when accessed as
 * static string literals (process.env.NEXT_PUBLIC_FOO). Dynamic access via
 * process.env[key] is NOT replaced at build time.
 */

export const VAULT_ADDRESS =
  ((process.env.NEXT_PUBLIC_VAULT_ADDRESS || "").trim() as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const ORACLE_ADDRESS =
  ((process.env.NEXT_PUBLIC_ORACLE_ADDRESS || "").trim() as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const USDT_ADDRESS =
  ((process.env.NEXT_PUBLIC_USDT_ADDRESS || "").trim() as `0x${string}`) ||
  "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"; // Celo mainnet USDT (6 decimals)

/**
 * Network constants. These default to Celo mainnet so the app works without
 * any env vars set on Vercel. An env var still overrides the default, which
 * keeps local dev / testnet usable (e.g. NEXT_PUBLIC_CHAIN_ID=11142220).
 */
export const CHAIN_ID =
  Number((process.env.NEXT_PUBLIC_CHAIN_ID || "").trim()) || 42220;

export const CELO_RPC_URL =
  (process.env.NEXT_PUBLIC_CELO_RPC_URL || "").trim() || "https://forno.celo.org";

/**
 * Celo mainnet stablecoin addresses for the "swap to USDT" explainer.
 * Both have env overrides so they can be cleared on testnet.
 */
export const USDC_ADDRESS =
  ((process.env.NEXT_PUBLIC_USDC_ADDRESS || "").trim() as `0x${string}`) ||
  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C"; // Celo mainnet USDC (6 decimals)

export const USDM_ADDRESS =
  ((process.env.NEXT_PUBLIC_USDM_ADDRESS || "").trim() as `0x${string}`) ||
  "0x765DE816845861e75A25fCA122bb6898B8B1282a"; // Celo mainnet USDm (18 decimals)

export const ENTRY_FEE = BigInt("100000"); // 0.10 USDT (6 decimals)
export const ENTRY_FEE_18 = BigInt("100000000000000000"); // 0.10 in 18 decimals (USDm equivalent)

/**
 * MiniPay deeplink for adding cash. Opens the deposit flow inside MiniPay.
 * Canonical list: https://docs.minipay.xyz/technical-references/deeplinks.html
 */
export const MINIPAY_DEPOSIT_DEEPLINK = "https://minipay.opera.com/add_cash";

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
    name: "resolveRound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "hasRole",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "KEEPER_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "DEFAULT_ADMIN_ROLE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
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
