import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // Celo Sepolia Testnet (primary developer testnet, replaces Alfajores)
    celoSepolia: {
      url: process.env.CELO_SEPOLIA_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org",
      chainId: 11142220,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 5_000_000_000,
    },
    // Celo Alfajores Testnet (legacy, kept for compatibility)
    alfajores: {
      url: process.env.ALFAJORES_RPC_URL || "https://alfajores-forno.celo-testnet.org",
      chainId: 44787,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 5_000_000_000,
    },
    // Celo Mainnet
    celo: {
      url: process.env.CELO_RPC_URL || "https://forno.celo.org",
      chainId: 42220,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 300_000_000_000, // 300 gwei — headroom over ~200 gwei mainnet base fee (2026-06)
    },
    // Local Hardhat network for testing
    hardhat: {
      chainId: 31337,
    },
    // Local node started with `npx hardhat node`
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  sourcify: {
    enabled: true,
  },
  etherscan: {
    // Etherscan V2: a single key routed by chainId (Celoscan is Etherscan-powered
    // and covered by V2 for celo mainnet). Celo Sepolia uses Blockscout (no key
    // required), kept as a customChain below.
    apiKey: process.env.CELOSCAN_API_KEY || "",
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          // Etherscan V2 unified endpoint (routes by chainId); Celoscan is powered by it.
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://celoscan.io",
        },
      },
      {
        network: "celoSepolia",
        chainId: 11142220,
        urls: {
          apiURL: "https://celo-sepolia.blockscout.com/api",
          browserURL: "https://celo-sepolia.blockscout.com",
        },
      },
    ],
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
