/**
 * setup-chainlink.ts
 * Registers the MiniStreak.resolveRound() function with Chainlink Automation.
 *
 * Usage:
 *   npx hardhat run scripts/setup-chainlink.ts --network alfajores
 *
 * Prerequisites:
 *   - Vault is deployed (read from deployments/<network>.json)
 *   - CHAINLINK_REGISTRY_ADDRESS is set in .env
 *   - Deployer wallet has enough LINK to fund the upkeep
 *
 * NOTE: Chainlink Automation on Celo uses a custom registry.
 *       This script registers a time-based upkeep that calls resolveRound
 *       every Sunday at 23:59 UTC (via cron-like scheduling).
 */

import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Chainlink Automation Registry ABI (simplified — only what we need)
const REGISTRY_ABI = [
  "function registerUpkeep(tuple(string name, bytes encryptedEmail, address upkeepContract, uint32 gasLimit, address adminAddress, uint8 triggerType, bytes checkData, bytes triggerConfig, bytes offchainConfig, uint96 amount) requestParams) external returns (uint256 id)",
  "function getUpkeep(uint256 id) external view returns (tuple(address target, uint32 executeGas, bytes checkData, uint96 balance, address lastKeeper, bytes32 lastPerformHash, uint256 amountSpent, address admin, uint64 maxValidBlocknumber, uint32 lastPerformBlockNumber, uint96 amountCollected, bool paused, bytes offchainConfig))",
];

const LINK_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

// LINK token addresses on Celo
const LINK_ADDRESSES: Record<number, string> = {
  44787: "0xa36085F69e2889c224210F603D836748e7dC0088", // Alfajores LINK
  42220: "0xa36085F69e2889c224210F603D836748e7dC0088", // Mainnet LINK
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log("\n=== Chainlink Automation Setup ===");
  console.log(`Network:  ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  // Load deployment info
  const deploymentPath = path.join(
    __dirname,
    `../deployments/${network.name}.json`
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `No deployment found at ${deploymentPath}. Run deploy.ts first.`
    );
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const vaultAddress = deployment.contracts.vault;
  console.log(`Vault:    ${vaultAddress}`);

  const registryAddress =
    process.env.CHAINLINK_REGISTRY_ADDRESS ||
    (chainId === 44787
      ? "0x9a811502d843E5a03913d5A2cfb646c11463467A"
      : "0x02777053d6764996e594c3E88AF1D58D5363a2e6");

  console.log(`Registry: ${registryAddress}`);

  const linkAddress = LINK_ADDRESSES[chainId];
  if (!linkAddress) throw new Error(`No LINK address for chainId ${chainId}`);

  const link = new ethers.Contract(linkAddress, LINK_ABI, deployer);
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, deployer);

  // 5 LINK for initial upkeep funding
  const LINK_AMOUNT = ethers.parseEther("5");

  const linkBalance = await link.balanceOf(deployer.address);
  console.log(`LINK balance: ${ethers.formatEther(linkBalance)} LINK`);
  if (linkBalance < LINK_AMOUNT) {
    throw new Error(
      `Insufficient LINK. Need 5 LINK, have ${ethers.formatEther(linkBalance)}`
    );
  }

  // Encode the resolveRound call — keeper will call this
  // We pass the current round ID as check data; the keeper reads it
  const vaultIface = new ethers.Interface([
    "function resolveRound(uint256 roundId) external",
    "function getCurrentRoundId() external view returns (uint256)",
  ]);

  // checkData is empty — the keeper will use performData returned by checkUpkeep
  const checkData = "0x";

  // triggerConfig for time-based: weekly, Sunday 23:59 UTC
  // Chainlink cron syntax: "59 23 * * 0" (minute hour day month weekday)
  // Encoded as bytes
  const cronExpression = "59 23 * * 0"; // Every Sunday at 23:59 UTC
  const triggerConfig = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string"],
    [cronExpression]
  );

  console.log("\nRegistering Chainlink Automation upkeep...");
  console.log(`Cron: ${cronExpression}`);

  // Approve LINK spend
  const approveTx = await link.approve(registryAddress, LINK_AMOUNT);
  await approveTx.wait();
  console.log(`LINK approved. Tx: ${approveTx.hash}`);

  // Register upkeep
  // Note: exact ABI varies by registry version — adjust if needed
  const registerParams = {
    name: "MiniStreak Weekly Round Resolution",
    encryptedEmail: "0x",
    upkeepContract: vaultAddress,
    gasLimit: 500_000,
    adminAddress: deployer.address,
    triggerType: 1, // 1 = time-based (cron)
    checkData,
    triggerConfig,
    offchainConfig: "0x",
    amount: LINK_AMOUNT,
  };

  // transferAndCall to register
  const registerData = registry.interface.encodeFunctionData("registerUpkeep", [
    registerParams,
  ]);

  const registerTx = await link.transferAndCall(
    registryAddress,
    LINK_AMOUNT,
    registerData
  );
  const receipt = await registerTx.wait();
  console.log(`Upkeep registered. Tx: ${registerTx.hash}`);

  console.log("\n=== Chainlink Setup Complete ===");
  console.log("The keeper will call resolveRound() every Sunday at 23:59 UTC.");
  console.log("Monitor at: https://automation.chain.link");

  // Update deployment file with keeper info
  deployment.chainlinkUpkeep = {
    registry: registryAddress,
    cron: cronExpression,
    linkFunded: ethers.formatEther(LINK_AMOUNT),
    registeredAt: new Date().toISOString(),
    txHash: registerTx.hash,
  };
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
