/**
 * verify.ts
 * Verifies deployed contracts on Blockscout / Celoscan.
 *
 * Usage:
 *   npx hardhat run scripts/verify.ts --network celoSepolia
 *   npx hardhat run scripts/verify.ts --network celo
 */

import { run, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const deploymentPath = path.join(
    __dirname,
    `../deployments/${network.name}.json`
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`No deployment found for network: ${network.name}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const { vault, oracle, usdt } = deployment.contracts;
  const treasury = deployment.treasury;
  const oracleHotWallet = deployment.oracleHotWallet;

  console.log(`\n=== Verifying on Blockscout (${network.name}) ===`);

  // Verify MiniStreak
  console.log(`\nVerifying MiniStreak at ${vault}...`);
  try {
    await run("verify:verify", {
      address: vault,
      constructorArguments: [usdt, treasury],
    });
    console.log("MiniStreak verified!");
  } catch (e: any) {
    if (e.message?.includes("Already Verified")) {
      console.log("MiniStreak already verified.");
    } else {
      console.error("MiniStreak verification failed:", e.message);
    }
  }

  // Verify StreakOracle
  console.log(`\nVerifying StreakOracle at ${oracle}...`);
  try {
    await run("verify:verify", {
      address: oracle,
      constructorArguments: [vault, oracleHotWallet],
    });
    console.log("StreakOracle verified!");
  } catch (e: any) {
    if (e.message?.includes("Already Verified")) {
      console.log("StreakOracle already verified.");
    } else {
      console.error("StreakOracle verification failed:", e.message);
    }
  }

  console.log("\nVerification complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
