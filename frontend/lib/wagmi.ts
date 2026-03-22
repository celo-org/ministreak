"use client";

import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { celo } from "viem/chains";
import { defineChain } from "viem";

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

const chainId = parseInt((process.env.NEXT_PUBLIC_CHAIN_ID || "11142220").trim());

function getActiveChain() {
  if (chainId === 42220)   return celo;
  if (chainId === 31337)   return hardhatLocal;
  if (chainId === 44787)   return celoSepolia; // legacy fallback
  return celoSepolia; // default: Celo Sepolia
}

const activeChain = getActiveChain();

const rpcUrl = (process.env.NEXT_PUBLIC_CELO_RPC_URL || 
  (chainId === 42220
    ? "https://forno.celo.org"
    : chainId === 31337
    ? "http://127.0.0.1:8545"
    : chainId === 44787
    ? "https://alfajores-forno.celo-testnet.org"
    : "https://forno.celo-sepolia.celo-testnet.org")).trim();

const wcProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    // MiniPay provides window.ethereum — injected connector picks it up.
    // In local dev, MetaMask injected also uses this connector.
    injected({ target: "metaMask" }),
    // WalletConnect for non-MiniPay browsers (skip if no project ID)
    ...(wcProjectId
      ? [walletConnect({ projectId: wcProjectId })]
      : []),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transports: Object.fromEntries([[activeChain.id, http(rpcUrl)]]) as any,
  ssr: true,
});

export { activeChain };
