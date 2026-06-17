"use client";

import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { celo } from "viem/chains";
import { defineChain } from "viem";
import { CHAIN_ID, CELO_RPC_URL } from "./contracts";

// Celo Sepolia testnet (primary developer testnet, chain ID 11142220)
const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
    public: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://celo-sepolia.blockscout.com" },
  },
  testnet: true,
});

// Local Hardhat node
const hardhatLocal = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
    public: { http: ["http://127.0.0.1:8545"] },
  },
});

// Defaults to Celo mainnet (42220). Overridable via NEXT_PUBLIC_CHAIN_ID for
// local dev / testnet. See lib/contracts.ts.
const chainId = CHAIN_ID;

function getActiveChain() {
  if (chainId === 42220)   return celo;
  if (chainId === 31337)   return hardhatLocal;
  if (chainId === 44787)   return celoSepolia; // legacy fallback
  if (chainId === 11142220) return celoSepolia;
  return celo; // default: Celo mainnet
}

const activeChain = getActiveChain();

// Mainnet uses the shared CELO_RPC_URL constant (env-overridable). Testnet/local
// keep their own defaults so dev still works when only NEXT_PUBLIC_CHAIN_ID is set.
const rpcUrl =
  chainId === 31337
    ? (process.env.NEXT_PUBLIC_CELO_RPC_URL || "http://127.0.0.1:8545").trim()
    : chainId === 44787
    ? (process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://alfajores-forno.celo-testnet.org").trim()
    : chainId === 11142220
    ? (process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org").trim()
    : CELO_RPC_URL;

const wcProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    injected(),
    ...(wcProjectId
      ? [walletConnect({ projectId: wcProjectId })]
      : []),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transports: Object.fromEntries([[activeChain.id, http(rpcUrl)]]) as any,
  ssr: true,
});

export { activeChain };
