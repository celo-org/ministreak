/**
 * constants.ts
 * Central registry of deployed contract addresses, token addresses,
 * and ABI references for Celo Grind.
 *
 * Update DEPLOYED_ADDRESSES after each deployment.
 */

// ─── Chain IDs ──────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  CELO_MAINNET:  42220,
  CELO_SEPOLIA:  11142220, // primary testnet (replaces Alfajores)
  CELO_ALFAJORES: 44787,   // legacy testnet
} as const;

// ─── USDT Token Addresses ─────────────────────────────────────────────────
// Celo Sepolia: MockUSDT deployed by deploy.ts (address filled post-deploy)
// Celo Mainnet: verify official Tether / bridge address before use

export const USDT_ADDRESSES: Record<number, `0x${string}`> = {
  [CHAIN_IDS.CELO_MAINNET]:  "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", // TODO: verify mainnet USDT
  [CHAIN_IDS.CELO_SEPOLIA]:  "0xd077A400968890Eacc75cdc901F0356c943e4fDb", // official USDT on Celo Sepolia (6 decimals)
  [CHAIN_IDS.CELO_ALFAJORES]: "0x0000000000000000000000000000000000000000", // filled after deploy:alfajores
};

// ─── RPC URLs ────────────────────────────────────────────────────────────────

export const RPC_URLS: Record<number, string> = {
  [CHAIN_IDS.CELO_MAINNET]:   "https://forno.celo.org",
  [CHAIN_IDS.CELO_SEPOLIA]:   "https://forno.celo-sepolia.celo-testnet.org",
  [CHAIN_IDS.CELO_ALFAJORES]: "https://alfajores-forno.celo-testnet.org",
};

// ─── Block Explorers ─────────────────────────────────────────────────────────

export const BLOCK_EXPLORERS: Record<number, string> = {
  [CHAIN_IDS.CELO_MAINNET]:   "https://celoscan.io",
  [CHAIN_IDS.CELO_SEPOLIA]:   "https://celo-sepolia.blockscout.com",
  [CHAIN_IDS.CELO_ALFAJORES]: "https://alfajores.celoscan.io",
};

// ─── Deployed Contract Addresses ─────────────────────────────────────────────
// Fill in after each deployment run

export const DEPLOYED_ADDRESSES: Record<
  number,
  { miniStreak: `0x${string}`; oracle: `0x${string}`; usdt: `0x${string}`; streakXp: `0x${string}` }
> = {
  [CHAIN_IDS.CELO_SEPOLIA]: {
    miniStreak: "0x911BD7790a581831BbE544bC782cc78659ce41b8",
    oracle:     "0x6827D8155eF79a7f2d8eA87f8E64b04b3E6936D7",
    usdt:       "0xd077A400968890Eacc75cdc901F0356c943e4fDb",
    streakXp:   "0x0000000000000000000000000000000000000000", // TODO: fill after deploy
  },
  [CHAIN_IDS.CELO_MAINNET]: {
    miniStreak: "0x0000000000000000000000000000000000000000", // TODO: fill after mainnet deploy
    oracle:     "0x0000000000000000000000000000000000000000", // TODO: fill after mainnet deploy
    usdt:       "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", // TODO: verify mainnet USDT address
    streakXp:   "0x0000000000000000000000000000000000000000", // TODO: fill after mainnet deploy
  },
};

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export const VAULT_ABI = [
  // State-changing
  "function enterRound(uint256 roundId) external",
  "function claimRefund(uint256 roundId) external",
  "function recordStreak(address player, uint256 roundId, uint8 dayIndex, uint32 txCount, uint16 uniqueToCount) external",
  "function resolveRound(uint256 roundId) external",
  "function setTreasury(address _treasury) external",
  "function pause() external",
  "function unpause() external",
  // Views
  "function getRoundPlayers(uint256 roundId) external view returns (address[])",
  "function getPlayerStats(uint256 roundId, address player) external view returns (uint8 streak, uint32 txCount, uint16 uniqueToCount, uint8 lastValidDay, bool claimed, bool entered)",
  "function getCurrentRoundId() external view returns (uint256)",
  "function getRoundStatus(uint256 roundId) external view returns (uint8)",
  "function getLeaderboard(uint256 roundId) external view returns (address[] addresses, uint8[] streaks, uint32[] txCounts, uint16[] uniqueToCounts, uint256[] ranks)",
  "function rounds(uint256) external view returns (uint256 startTime, uint256 endTime, uint256 pot, uint8 status, uint256 playerCount)",
  "function playerRecords(uint256 roundId, address player) external view returns (uint8 streak, uint8 lastValidDay, uint32 txCount, uint16 uniqueToCount, bool claimed, bool entered)",
  "function ENTRY_FEE() external view returns (uint256)",
  "function currentRoundId() external view returns (uint256)",
  "function treasury() external view returns (address)",
  "function usdt() external view returns (address)",
  // Events
  "event PlayerEntered(uint256 indexed roundId, address indexed player, uint256 pot)",
  "event StreakRecorded(uint256 indexed roundId, address indexed player, uint8 dayIndex, uint32 txCount, uint16 uniqueToCount, uint8 newStreak)",
  "event RoundResolved(uint256 indexed roundId, address indexed first, address indexed second, address third, uint256 pot, uint256 protocolFee)",
  "event RoundRefunded(uint256 indexed roundId, uint256 playerCount, uint256 potReturned)",
  "event RefundClaimed(uint256 indexed roundId, address indexed player, uint256 amount)",
  "event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime)",
] as const;

export const ORACLE_ABI = [
  // State-changing
  "function submitStreak(address player, uint256 roundId, uint8 dayIndex, uint32 txCount, uint16 uniqueToCount) external",
  "function batchSubmitStreaks(address[] calldata players, uint256[] calldata roundIds, uint8[] calldata dayIndexes, uint32[] calldata txCounts, uint16[] calldata uniqueToCounts) external",
  "function setTrustedSubmitter(address _submitter) external",
  "function setVault(address _vault) external",
  // Views
  "function isSubmitted(address player, uint256 roundId, uint256 dayIndex) external view returns (bool)",
  "function trustedSubmitter() external view returns (address)",
  "function vault() external view returns (address)",
  // Events
  "event StreakSubmitted(address indexed player, uint256 indexed roundId, uint8 dayIndex, uint32 txCount, uint16 uniqueToCount)",
  "event SubmitterUpdated(address indexed oldSubmitter, address indexed newSubmitter)",
] as const;

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
] as const;

// ─── Game Constants (mirrors Solidity) ───────────────────────────────────────

export const GAME_CONSTANTS = {
  ENTRY_FEE: 500_000n,            // 0.5 USDT (6 decimals)
  PROTOCOL_FEE_BPS: 500n,         // 5%
  MIN_PLAYERS: 3,
  ROUND_DURATION_SECONDS: 7 * 24 * 60 * 60, // 7 days
} as const;
