/**
 * finalize-streakxp.ts
 * Re-reads an already-deployed StreakXP (past the deploy-time RPC race), confirms
 * it is wired to the expected vault, and merges its address into
 * deployments/<network>.json. Read-only on-chain (no tx, no key needed for reads).
 *
 *   XP_ADDRESS=0x... npx hardhat run scripts/finalize-streakxp.ts --network celo
 */
import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const xpAddress = process.env.XP_ADDRESS;
  if (!xpAddress) throw new Error("Set XP_ADDRESS env to the deployed StreakXP address.");

  const depPath = path.join(__dirname, `../deployments/${network.name}.json`);
  const deployment = fs.existsSync(depPath)
    ? JSON.parse(fs.readFileSync(depPath, "utf8"))
    : null;
  const expectedVault = deployment?.contracts?.vault;

  console.log(`\n=== Finalize StreakXP on ${network.name} ===`);
  console.log(`StreakXP: ${xpAddress}`);

  const code = await ethers.provider.getCode(xpAddress);
  console.log(`Has code: ${code !== "0x" ? "yes" : "NO — not deployed!"}`);
  if (code === "0x") throw new Error("No code at StreakXP address — deploy did not land.");

  const xp = await ethers.getContractAt("StreakXP", xpAddress);
  const vault = await xp.vault();
  const owner = await xp.owner();
  const dailyXp = await xp.dailyXp();

  console.log(`vault():   ${vault}`);
  console.log(`owner():   ${owner}`);
  console.log(`dailyXp(): ${dailyXp.toString()}`);

  if (expectedVault && vault.toLowerCase() !== expectedVault.toLowerCase()) {
    throw new Error(`vault() ${vault} != expected ${expectedVault} — WRONG binding, do not use.`);
  }
  console.log(`\nBinding OK: StreakXP -> vault ${vault}`);

  if (deployment) {
    deployment.contracts = { ...deployment.contracts, streakXp: xpAddress };
    deployment.streakXpDeployedAt = new Date().toISOString();
    fs.writeFileSync(depPath, JSON.stringify(deployment, null, 2) + "\n");
    console.log(`Saved streakXp into ${depPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
