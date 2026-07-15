/**
 * deploy-streakxp.ts
 *
 * Deploys ONLY the StreakXP contract, bound to the ALREADY-DEPLOYED MiniStreak
 * vault. Use this to add on-chain XP to a live deployment WITHOUT redeploying
 * the vault/oracle (the full `deploy.ts` would deploy a fresh vault — never run
 * that against a live network).
 *
 *   npx hardhat run scripts/deploy-streakxp.ts --network celo
 *
 * Env:
 *   DEPLOYER_PRIVATE_KEY   the deploying wallet — becomes StreakXP's owner
 *                          (owner can call setDailyXp). Must hold CELO for gas.
 *   VAULT_ADDRESS          (optional) override the vault; defaults to the
 *                          `contracts.vault` in deployments/<network>.json.
 *
 * StreakXP only READS public views on the vault (currentRoundId / getPlayerStats),
 * so no role grant on the vault is needed — deployment is self-contained.
 */
import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  // ─── Resolve the EXISTING vault address ─────────────────────────────────
  const depPath = path.join(__dirname, `../deployments/${network.name}.json`);
  let deployment: any = null;
  let vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress && fs.existsSync(depPath)) {
    deployment = JSON.parse(fs.readFileSync(depPath, "utf8"));
    vaultAddress = deployment?.contracts?.vault;
  }
  if (!vaultAddress) {
    throw new Error(
      `No vault address. Set VAULT_ADDRESS env or ensure deployments/${network.name}.json has contracts.vault.`
    );
  }

  console.log("\n=== Deploy StreakXP (only — binds to existing vault) ===");
  console.log(`Network:  ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}   <- becomes StreakXP owner`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${ethers.formatEther(bal)} CELO`);
  console.log(`Vault:    ${vaultAddress}   (existing — NOT redeployed)`);

  // ─── Safety: the vault must actually be a contract ──────────────────────
  const code = await ethers.provider.getCode(vaultAddress);
  if (code === "0x") {
    throw new Error(`No contract code at ${vaultAddress}. Wrong vault address — aborting.`);
  }
  if (bal === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 CELO — fund it for gas first.`);
  }

  // ─── Deploy ─────────────────────────────────────────────────────────────
  console.log("\nDeploying StreakXP...");
  const XP = await ethers.getContractFactory("StreakXP");
  const xp = await XP.deploy(vaultAddress);
  await xp.waitForDeployment();
  const xpAddress = await xp.getAddress();
  console.log(`\n✅ StreakXP deployed at: ${xpAddress}`);

  // ─── Read-back sanity checks ────────────────────────────────────────────
  console.log("\nRead-back:");
  console.log(`   vault():   ${await xp.vault()}   (must equal the vault above)`);
  console.log(`   owner():   ${await xp.owner()}   (must equal the deployer)`);
  console.log(`   dailyXp(): ${(await xp.dailyXp()).toString()}   (expect 10)`);

  // ─── Save (non-destructive merge into deployments/<network>.json) ───────
  if (deployment) {
    deployment.contracts = { ...deployment.contracts, streakXp: xpAddress };
    deployment.streakXpDeployedAt = new Date().toISOString();
    fs.writeFileSync(depPath, JSON.stringify(deployment, null, 2) + "\n");
    console.log(`\nSaved streakXp into ${depPath}`);
  }

  console.log("\n=== Next steps ===");
  console.log(`1. Verify:`);
  console.log(`   npx hardhat verify --network ${network.name} ${xpAddress} "${vaultAddress}"`);
  console.log(`2. Set constants.ts DEPLOYED_ADDRESSES[${chainId}].streakXp = "${xpAddress}"`);
  console.log(`3. Set NEXT_PUBLIC_XP_ADDRESS=${xpAddress} in Vercel, then redeploy the frontend.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
