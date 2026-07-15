import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const DAY = 86400;

async function deployFixture() {
  const [owner, player, other] = await ethers.getSigners();
  const Mock = await ethers.getContractFactory("MockMiniStreak");
  const vault = await Mock.deploy();
  await vault.waitForDeployment();
  const XP = await ethers.getContractFactory("StreakXP");
  const xp = await XP.deploy(await vault.getAddress());
  await xp.waitForDeployment();
  // Enter `player` in round 1 by default.
  await vault.setEntered(1, player.address, true);
  return { owner, player, other, vault, xp };
}

describe("StreakXP", () => {
  it("grants dailyXp on claim and emits Claimed", async () => {
    const { xp, player } = await deployFixture();
    await expect(xp.connect(player).claimDaily()).to.emit(xp, "Claimed");
    expect(await xp.xp(player.address)).to.equal(10n);
  });

  it("reverts a second claim on the same UTC day", async () => {
    const { xp, player } = await deployFixture();
    await xp.connect(player).claimDaily();
    await expect(xp.connect(player).claimDaily()).to.be.revertedWithCustomError(
      xp,
      "AlreadyClaimedToday"
    );
  });

  it("allows a claim again once the UTC day rolls over", async () => {
    const { xp, player } = await deployFixture();
    await xp.connect(player).claimDaily();
    await time.increase(DAY);
    await xp.connect(player).claimDaily();
    expect(await xp.xp(player.address)).to.equal(20n);
  });

  it("resets per calendar day, not on a 24h cooldown (claim 23:59 then 00:00)", async () => {
    const { xp, player } = await deployFixture();
    const now = await time.latest();
    const nextMidnight = (Math.floor(now / DAY) + 2) * DAY; // a future 00:00 UTC
    await time.setNextBlockTimestamp(nextMidnight - 60); // 23:59 of day D-1
    await xp.connect(player).claimDaily();
    await time.setNextBlockTimestamp(nextMidnight); // 00:00 of day D, ~60s later
    await xp.connect(player).claimDaily(); // succeeds despite <24h elapsed
    expect(await xp.xp(player.address)).to.equal(20n);
  });

  it("reverts when the caller is not entered in the current round", async () => {
    const { xp, other } = await deployFixture();
    await expect(xp.connect(other).claimDaily()).to.be.revertedWithCustomError(
      xp,
      "NotEntered"
    );
  });

  it("canClaim reflects entry + day state", async () => {
    const { xp, player, other } = await deployFixture();
    expect(await xp.canClaim(player.address)).to.equal(true);
    expect(await xp.canClaim(other.address)).to.equal(false); // not entered
    await xp.connect(player).claimDaily();
    expect(await xp.canClaim(player.address)).to.equal(false); // already today
    await time.increase(DAY);
    expect(await xp.canClaim(player.address)).to.equal(true);
  });

  it("setDailyXp is owner-only and changes the grant", async () => {
    const { xp, owner, player, other } = await deployFixture();
    await expect(xp.connect(other).setDailyXp(25)).to.be.revertedWithCustomError(
      xp,
      "OwnableUnauthorizedAccount"
    );
    await xp.connect(owner).setDailyXp(25);
    await xp.connect(player).claimDaily();
    expect(await xp.xp(player.address)).to.equal(25n);
  });

  it("is soulbound (exposes no transfer surface)", async () => {
    const { xp } = await deployFixture();
    expect((xp as unknown as { transfer?: unknown }).transfer).to.equal(undefined);
  });
});
