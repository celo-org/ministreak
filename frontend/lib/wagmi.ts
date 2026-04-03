"use client";

import { createConfig, http } from "wagmi";
import type { CreateConnectorFn } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { celo } from "viem/chains";
import { defineChain } from "viem";
import { appendSuffix } from "./ministreakSuffix";

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

// IMPORTANT: must use static string literal for Next.js to inline at build time
const chainId = parseInt((process.env.NEXT_PUBLIC_CHAIN_ID ?? "11142220").trim());

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

/**
 * Wrap a wagmi connector so every eth_sendTransaction has the ministreak
 * suffix appended to its data field. Works with MiniPay (injected),
 * MetaMask, WalletConnect, and any EIP-1193 provider.
 */
function wrapConnector(connector: CreateConnectorFn): CreateConnectorFn {
  return (config) => {
    const result = connector(config);
    const originalGetProvider = result.getProvider.bind(result);

    result.getProvider = async (...args: Parameters<typeof result.getProvider>) => {
      const rawProvider = await originalGetProvider(...args);

      // During SSR / static generation there is no browser wallet — bail out early
      if (!rawProvider) return rawProvider;

      // Cast to a mutable EIP-1193-like provider
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = rawProvider as any;

      // Only wrap once — tag the provider to avoid double-wrapping on re-renders
      if (provider.__ministreakWrapped) return rawProvider;
      provider.__ministreakWrapped = true;

      const originalRequest = provider.request.bind(provider);
      provider.request = async (req: { method: string; params?: unknown[] | object }) => {
        if (req.method === "eth_sendTransaction" && Array.isArray(req.params) && req.params[0]) {
          const tx = { ...(req.params[0] as Record<string, unknown>) };
          tx.data = appendSuffix(tx.data as `0x${string}` | undefined);
          return originalRequest({ ...req, params: [tx, ...req.params.slice(1)] });
        }
        return originalRequest(req);
      };

      return rawProvider;
    };

    return result;
  };
}

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    // MiniPay provides window.ethereum — injected connector picks it up.
    // In local dev, MetaMask or any injected wallet also uses this connector.
    wrapConnector(injected()),
    // WalletConnect for non-MiniPay browsers (skip if no project ID)
    ...(wcProjectId
      ? [wrapConnector(walletConnect({ projectId: wcProjectId }))]
      : []),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transports: Object.fromEntries([[activeChain.id, http(rpcUrl)]]) as any,
  ssr: true,
});

export { activeChain };
