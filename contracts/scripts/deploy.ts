/**
 * deploy.ts
 * Deploys CeloGrindVault and StreakOracle to Celo Alfajores (or Mainnet).
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network alfajores
 *   npx hardhat run scripts/deploy.ts --network celo
 *
 * After deploy, update constants.ts with the returned addresses.
 */

import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// ─── Chain-specific config ────────────────────────────────────────────────────

// USDT addresses for live networks.
// Celo Sepolia: use the official USDT (6 decimals) — no MockUSDT needed.
// Alfajores: deploy MockUSDT (legacy testnet, rarely used).
// Mainnet: verify this address at https://celoscan.io before production deploy.
const LIVE_USDT: Record<number, string> = {
  42220:    "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", // Celo Mainnet USDT — VERIFY BEFORE USE
  11142220: "0xd077A400968890Eacc75cdc901F0356c943e4fDb", // Celo Sepolia official USDT (6 decimals)
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("\n=== MiniStreak Deployment ===");
  console.log(`Network:   ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer:  ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:   ${ethers.formatEther(balance)} CELO`);

  const treasuryAddress =
    process.env.TREASURY_ADDRESS || deployer.address;

  const oracleHotWallet =
    process.env.ORACLE_HOT_WALLET || deployer.address;

  console.log(`Treasury:  ${treasuryAddress}`);
  console.log(`Oracle HW: ${oracleHotWallet}`);

  // ─── 1. Resolve USDT address (deploy MockUSDT on testnets) ───────────────

  let usdtAddress: string;
  const isLegacyTestnet = Number(chainId) === 44787; // Alfajores only — use MockUSDT

  if (isLegacyTestnet) {
    console.log("\n[1/4] Deploying MockUSDT (Alfajores testnet)...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUsdt = await MockERC20.deploy("Tether USD", "USDT", 6);
    await mockUsdt.waitForDeployment();
    usdtAddress = await mockUsdt.getAddress();
    console.log(`      MockUSDT deployed at: ${usdtAddress}`);

    // Mint 100,000 USDT to deployer for testing
    await mockUsdt.mint(deployer.address, ethers.parseUnits("100000", 6));
    console.log(`      Minted 100,000 USDT to deployer for testing`);
  } else {
    // Celo Sepolia & Mainnet: use real USDT
    usdtAddress = process.env.USDT_ADDRESS || LIVE_USDT[Number(chainId)];
    if (!usdtAddress || usdtAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error(
        `No USDT address configured for chainId ${chainId}. ` +
        `Set USDT_ADDRESS env var or verify contracts/scripts/deploy.ts LIVE_USDT.`
      );
    }
    console.log(`\n[1/4] Using USDT: ${usdtAddress}`);
  }

  console.log(`USDT:      ${usdtAddress}`);

  // ─── 2. Deploy CeloGrindVault ─────────────────────────────────────────────

  console.log("\n[2/4] Deploying MiniStreak...");
  const VaultFactory = await ethers.getContractFactory("MiniStreak");
  const vault = await VaultFactory.deploy(usdtAddress, treasuryAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`      MiniStreak deployed at: ${vaultAddress}`);

  // ─── 3. Deploy StreakOracle ───────────────────────────────────────────────

  console.log("\n[3/4] Deploying StreakOracle...");
  const OracleFactory = await ethers.getContractFactory("StreakOracle");
  const oracle = await OracleFactory.deploy(vaultAddress, oracleHotWallet);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`      StreakOracle deployed at:   ${oracleAddress}`);

  // ─── 4. Grant ORACLE_ROLE on Vault to StreakOracle ────────────────────────

  console.log("\n[4/4] Granting ORACLE_ROLE to StreakOracle on Vault...");
  const ORACLE_ROLE = await vault.ORACLE_ROLE();
  const grantTx = await vault.grantRole(ORACLE_ROLE, oracleAddress);
  await grantTx.wait();
  console.log(`      ORACLE_ROLE granted. Tx: ${grantTx.hash}`);

  // ─── Summary ──────────────────────────────────────────────────────────────

  const deploymentInfo = {
    network: network.name,
    chainId: chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury: treasuryAddress,
    oracleHotWallet,
    contracts: {
      vault: vaultAddress,
      oracle: oracleAddress,
      usdt: usdtAddress,
    },
  };

  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(deploymentInfo, null, 2));

  // Write deployment info to file
  const outPath = path.join(
    __dirname,
    `../deployments/${network.name}.json`
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${outPath}`);

  console.log("\n=== Next Steps ===");
  console.log("1. Update contracts/constants.ts DEPLOYED_ADDRESSES with the new addresses above");
  console.log("2. Run contract verification:");
  console.log(
    `   npx hardhat verify --network ${network.name} ${vaultAddress} "${usdtAddress}" "${treasuryAddress}"`
  );
  console.log(
    `   npx hardhat verify --network ${network.name} ${oracleAddress} "${vaultAddress}" "${oracleHotWallet}"`
  );
  console.log("3. Update oracle-service/.env with:");
  console.log(`   VAULT_ADDRESS=${vaultAddress}`);
  console.log(`   ORACLE_ADDRESS=${oracleAddress}`);
  console.log(`   USDT_ADDRESS=${usdtAddress}`);
  console.log("4. Update frontend/.env.local with:");
  console.log(`   NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`   NEXT_PUBLIC_ORACLE_ADDRESS=${oracleAddress}`);
  console.log(`   NEXT_PUBLIC_USDT_ADDRESS=${usdtAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
