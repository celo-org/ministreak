# On-chain Claimable Daily XP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace off-chain oracle-awarded XP with an on-chain, player-claimed daily XP ledger (`StreakXP`); the claim doubles as the day's streak tx, XP usage (levels, freeze grants) is unchanged.

**Architecture:** New soulbound `StreakXP` Solidity contract with a per-UTC-day `claimDaily()` gated to entered players. Frontend claims via a `useClaimXp` hook (ERC-8021 attributed) and reads XP on-chain. The oracle stops awarding XP; freeze-token grants re-source from on-chain XP while staying KV-managed.

**Tech Stack:** Solidity 0.8.20 (Hardhat, viaIR), OpenZeppelin v5, viem/wagmi, Next.js 14, Vitest, Vercel KV.

## Global Constraints

- Solidity **0.8.20**; `viaIR: true` (repo hardhat config). OZ v5 → `Ownable(msg.sender)` constructor form.
- Day boundary is **`block.timestamp / 1 days`** (whole UTC days since epoch, rolls at 00:00 UTC). Eligibility is a **per-calendar-day reset, never a rolling 24h cooldown**: `lastClaimDay[player] < today` — a 23:59 claim can re-claim at 00:00.
- `dailyXp` default **10**, owner-settable. XP is **flat** (no streak scaling).
- Claim is **gated to entered players** (entered in `currentRoundId`).
- XP is **soulbound** — no transfer/approve surface.
- Every on-chain **write** from the frontend carries the ERC-8021 suffix: `dataSuffix: BUILDER_SUFFIX` (from `@/lib/builderCode`), legacy tx mode, gas-price buffer — exactly like `useEnterRound`.
- **Fresh start**: no XP migration/seeding.
- XP/level are read **on-chain** on the client; **freeze tokens stay in KV** (oracle grants + spends). The pot ranking (streak → Score → uniqueTo) is **untouched**.

---

### Task 1: `StreakXP` contract + tests

**Files:**
- Create: `contracts/src/StreakXP.sol`
- Create: `contracts/src/MockMiniStreak.sol` (test double for the vault interface)
- Test: `contracts/test/StreakXP.test.ts`

**Interfaces:**
- Consumes: the deployed vault via `IMiniStreak { currentRoundId(); getPlayerStats(uint256,address) }`.
- Produces: `claimDaily()`, `canClaim(address)→bool`, `xp(address)→uint256`, `lastClaimDay(address)→uint32`, `dailyXp()→uint256`, `setDailyXp(uint256)`, event `Claimed(address indexed,uint32 indexed,uint256,uint256)`, errors `NotEntered()`, `AlreadyClaimedToday()`.

- [ ] **Step 1: Write the mock vault**

`contracts/src/MockMiniStreak.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Minimal MiniStreak stand-in for StreakXP unit tests.
contract MockMiniStreak {
    uint256 public currentRoundId = 1;
    mapping(uint256 => mapping(address => bool)) public enteredOf;

    function setCurrentRoundId(uint256 id) external { currentRoundId = id; }
    function setEntered(uint256 roundId, address player, bool v) external {
        enteredOf[roundId][player] = v;
    }

    function getPlayerStats(uint256 roundId, address player)
        external
        view
        returns (uint8, uint32, uint16, uint8, bool, bool)
    {
        return (0, 0, 0, 0, false, enteredOf[roundId][player]);
    }
}
```

- [ ] **Step 2: Write the failing tests**

`contracts/test/StreakXP.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests, verify they fail**

Run: `cd contracts && npx hardhat test test/StreakXP.test.ts`
Expected: FAIL — `StreakXP` artifact not found / compile error.

- [ ] **Step 4: Write the contract**

`contracts/src/StreakXP.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IMiniStreak {
    function currentRoundId() external view returns (uint256);
    function getPlayerStats(uint256 roundId, address player)
        external
        view
        returns (
            uint8 streak,
            uint32 txCount,
            uint16 uniqueToCount,
            uint8 lastValidDay,
            bool claimed,
            bool entered
        );
}

/// @title StreakXP — soulbound, daily-claimable XP for MiniStreak.
/// @notice Entered players claim a flat XP amount once per UTC calendar day.
///         XP is a non-transferable counter; it drives levels/freeze grants
///         off-chain and carries no pot-ranking weight.
contract StreakXP is Ownable {
    IMiniStreak public immutable vault;

    /// @notice Flat XP granted per daily claim.
    uint256 public dailyXp = 10;

    /// @notice Cumulative XP per player.
    mapping(address => uint256) public xp;

    /// @notice Last UTC day index (block.timestamp / 1 days) a player claimed.
    mapping(address => uint32) public lastClaimDay;

    event Claimed(address indexed player, uint32 indexed dayIndex, uint256 amount, uint256 newTotal);
    event DailyXpSet(uint256 dailyXp);

    error NotEntered();
    error AlreadyClaimedToday();

    constructor(address vault_) Ownable(msg.sender) {
        vault = IMiniStreak(vault_);
    }

    /// @notice Claim today's XP. Reverts if the caller is not entered in the
    ///         current round, or has already claimed during this UTC day.
    function claimDaily() external {
        uint256 roundId = vault.currentRoundId();
        (, , , , , bool entered) = vault.getPlayerStats(roundId, msg.sender);
        if (!entered) revert NotEntered();

        uint32 today = uint32(block.timestamp / 1 days);
        if (lastClaimDay[msg.sender] >= today) revert AlreadyClaimedToday();

        lastClaimDay[msg.sender] = today;
        uint256 newTotal = xp[msg.sender] + dailyXp;
        xp[msg.sender] = newTotal;
        emit Claimed(msg.sender, today, dailyXp, newTotal);
    }

    /// @notice True iff `player` is entered in the current round and has not
    ///         yet claimed during this UTC day.
    function canClaim(address player) external view returns (bool) {
        uint256 roundId = vault.currentRoundId();
        (, , , , , bool entered) = vault.getPlayerStats(roundId, player);
        if (!entered) return false;
        return lastClaimDay[player] < uint32(block.timestamp / 1 days);
    }

    function setDailyXp(uint256 dailyXp_) external onlyOwner {
        dailyXp = dailyXp_;
        emit DailyXpSet(dailyXp_);
    }
}
```

- [ ] **Step 5: Run the tests, verify they pass**

Run: `cd contracts && npx hardhat test test/StreakXP.test.ts`
Expected: PASS (8/8).

- [ ] **Step 6: Commit**

```bash
git add contracts/src/StreakXP.sol contracts/src/MockMiniStreak.sol contracts/test/StreakXP.test.ts
git commit -m "feat(contracts): StreakXP — soulbound daily-claimable XP (entered-only, per-UTC-day)"
```

---

### Task 2: Deploy script + constants wiring

**Files:**
- Modify: `contracts/scripts/deploy.ts` (deploy StreakXP after the oracle; add to saved `contracts` block + verify hint)
- Modify: `contracts/scripts/verify.ts` (add StreakXP verification)
- Modify: `contracts/constants.ts:46-60` (`DEPLOYED_ADDRESSES` gains a `streakXp` field)

**Interfaces:**
- Produces: `StreakXP` deployed with `vaultAddress`; `deployments/<network>.json` `.contracts.streakXp`; `DEPLOYED_ADDRESSES[chainId].streakXp`.

- [ ] **Step 1: Deploy StreakXP in `deploy.ts`**

After the `StreakOracle` deploy + ORACLE_ROLE grant block (`scripts/deploy.ts` ~line 105), before the summary:

```ts
  // ─── 5. Deploy StreakXP ───────────────────────────────────────────────────
  console.log("\n[5/5] Deploying StreakXP...");
  const XPFactory = await ethers.getContractFactory("StreakXP");
  const streakXp = await XPFactory.deploy(vaultAddress);
  await streakXp.waitForDeployment();
  const streakXpAddress = await streakXp.getAddress();
  console.log(`      StreakXP deployed at: ${streakXpAddress}`);
```

Add `streakXp: streakXpAddress` to `deploymentInfo.contracts`, and append a verify hint line:

```ts
  console.log(
    `   npx hardhat verify --network ${network.name} ${streakXpAddress} "${vaultAddress}"`
  );
```

- [ ] **Step 2: Add StreakXP to `verify.ts`**

Mirror the existing oracle verification block, constructor arg = the vault address, reading `streakXp` from the deployments file.

- [ ] **Step 3: Extend `DEPLOYED_ADDRESSES` in `constants.ts`**

Change the type and both chain entries:

```ts
export const DEPLOYED_ADDRESSES: Record<
  number,
  { miniStreak: `0x${string}`; oracle: `0x${string}`; usdt: `0x${string}`; streakXp: `0x${string}` }
> = {
  // ...existing entries, each gains:
  //   streakXp: "0x0000000000000000000000000000000000000000", // fill after deploy
};
```

Set the mainnet `streakXp` to the zero address placeholder (filled post-deploy).

- [ ] **Step 4: Verify it compiles + local deploy dry-run**

Run: `cd contracts && npx hardhat compile && npx hardhat run scripts/deploy-local.ts` (or `deploy.ts` against a local node) — confirm StreakXP deploys and the JSON contains `contracts.streakXp`.

- [ ] **Step 5: Commit**

```bash
git add contracts/scripts/deploy.ts contracts/scripts/verify.ts contracts/constants.ts
git commit -m "chore(contracts): deploy + verify + constants wiring for StreakXP"
```

---

### Task 3: Frontend contract wiring (`XP_ADDRESS`, `XP_ABI`)

**Files:**
- Modify: `frontend/lib/contracts.ts` (add `XP_ADDRESS`, `XP_ABI`)
- Test: `frontend/lib/contracts.test.ts` (assert defaults)

**Interfaces:**
- Produces: `XP_ADDRESS: 0x${string}`, `XP_ABI` (with `claimDaily`, `xp`, `lastClaimDay`, `canClaim`, `dailyXp`, `Claimed`).

- [ ] **Step 1: Write the failing test**

Add to `frontend/lib/contracts.test.ts`:

```ts
it("XP_ADDRESS falls back to the zero address when env is unset", async () => {
  vi.stubEnv("NEXT_PUBLIC_XP_ADDRESS", "");
  const c = await import("./contracts");
  expect(c.XP_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
});
```

- [ ] **Step 2: Add the constants**

In `frontend/lib/contracts.ts`, mirroring `ORACLE_ADDRESS`:

```ts
export const XP_ADDRESS =
  ((process.env.NEXT_PUBLIC_XP_ADDRESS || "").trim() as `0x${string}`) ||
  "0x0000000000000000000000000000000000000000";

export const XP_ABI = [
  "function claimDaily() external",
  "function xp(address) external view returns (uint256)",
  "function lastClaimDay(address) external view returns (uint32)",
  "function canClaim(address) external view returns (bool)",
  "function dailyXp() external view returns (uint256)",
  "event Claimed(address indexed player, uint32 indexed dayIndex, uint256 amount, uint256 newTotal)",
] as const;
```

(Match the ABI style already used in this file — human-readable strings if that is the existing convention, otherwise JSON fragments. Follow whatever `VAULT_ABI` uses.)

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npx vitest run lib/contracts.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/contracts.ts frontend/lib/contracts.test.ts
git commit -m "feat(frontend): XP_ADDRESS + XP_ABI wiring"
```

---

### Task 4: `useClaimXp` hook

**Files:**
- Create: `frontend/hooks/useClaimXp.ts`
- Test: `frontend/hooks/useClaimXp.test.ts`

**Interfaces:**
- Consumes: `XP_ADDRESS`, `XP_ABI`, `BUILDER_SUFFIX`, `activeChain`, wagmi `useConfig/usePublicClient/useAccount`, `getWalletClient`.
- Produces: `{ claim: () => Promise<void>, step: "idle"|"claiming"|"done"|"error", txHash, error, reset }`.

- [ ] **Step 1: Write the hook** (mirrors `useEnterRound`, single tx)

`frontend/hooks/useClaimXp.ts`:

```ts
"use client";

import { useState } from "react";
import { usePublicClient, useAccount, useConfig } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";
import { BUILDER_SUFFIX } from "@/lib/builderCode";

type Step = "idle" | "claiming" | "done" | "error";

export function useClaimXp() {
  const config = useConfig();
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (!publicClient || !address || !isConnected) {
      setStep("error");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }
    let walletClient;
    try {
      walletClient = await getWalletClient(config);
    } catch {
      setStep("error");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }

    setStep("claiming");
    setError(null);
    setTxHash(null);

    try {
      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * BigInt(120)) / BigInt(100);

      const gas = await publicClient.estimateContractGas({
        address: XP_ADDRESS,
        abi: XP_ABI,
        functionName: "claimDaily",
        account: address,
      });

      const tx = await walletClient.writeContract({
        address: XP_ADDRESS,
        abi: XP_ABI,
        functionName: "claimDaily",
        chain: activeChain,
        account: address,
        gas: (gas * BigInt(130)) / BigInt(100),
        gasPrice: gasPriceWithBuffer,
        type: "legacy" as const,
        dataSuffix: BUILDER_SUFFIX,
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx);
      setStep("done");
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Claim failed");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }

  return { claim, step, txHash, error, reset };
}
```

- [ ] **Step 2: Write the test**

`frontend/hooks/useClaimXp.test.ts` — mock `wagmi`, `@wagmi/core`, `@/lib/wagmi`, `@/lib/builderCode` (as `useEnterRound.test.ts` does if it exists; otherwise mock at module level). Assert:
- `step` starts `idle`; after a successful `claim()` it is `done` and `txHash` set.
- `writeContract` is called with `functionName: "claimDaily"` and `dataSuffix: BUILDER_SUFFIX`.
- a thrown `writeContract` sets `step: "error"` and `error`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const writeContract = vi.fn(async () => "0xhash");
const publicClient = {
  getGasPrice: vi.fn(async () => 1000000000n),
  estimateContractGas: vi.fn(async () => 100000n),
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
};
vi.mock("wagmi", () => ({
  usePublicClient: () => publicClient,
  useAccount: () => ({ address: "0xPlayer", isConnected: true }),
  useConfig: () => ({}),
}));
vi.mock("@wagmi/core", () => ({
  getWalletClient: vi.fn(async () => ({ writeContract })),
}));
vi.mock("@/lib/wagmi", () => ({ activeChain: { id: 42220 } }));
vi.mock("@/lib/builderCode", () => ({ BUILDER_SUFFIX: "0xSUFFIX" }));
vi.mock("@/lib/contracts", () => ({
  XP_ADDRESS: "0xXP",
  XP_ABI: [],
}));

import { useClaimXp } from "./useClaimXp";

beforeEach(() => vi.clearAllMocks());

describe("useClaimXp", () => {
  it("claims and reaches done, attributing via dataSuffix", async () => {
    const { result } = renderHook(() => useClaimXp());
    await act(async () => {
      await result.current.claim();
    });
    await waitFor(() => expect(result.current.step).toBe("done"));
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "claimDaily", dataSuffix: "0xSUFFIX" })
    );
  });

  it("sets error on failure", async () => {
    writeContract.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useClaimXp());
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.step).toBe("error");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run hooks/useClaimXp.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/hooks/useClaimXp.ts frontend/hooks/useClaimXp.test.ts
git commit -m "feat(frontend): useClaimXp hook (ERC-8021 attributed daily XP claim)"
```

---

### Task 5: On-chain XP read + `useProfile` rework + profile route

**Files:**
- Create: `frontend/hooks/useXp.ts` (on-chain xp + canClaim reads)
- Modify: `frontend/hooks/useProfile.ts` (compose on-chain XP + KV freeze)
- Modify: `frontend/app/api/profile/route.ts` (return `freezeTokens` only)
- Modify: `frontend/app/api/profile/route.test.ts`
- Test: `frontend/hooks/useProfile.test.ts` (new)

**Interfaces:**
- Consumes: `XP_ADDRESS`, `XP_ABI`, `lib/xp.ts` `xpProgress`/`levelForXp`, `/api/profile`.
- Produces: `useXp(address) → { xp, level, xpIntoLevel, xpForNextLevel, canClaim, refetch }`; `ProfileView` unchanged in shape (`{ xp, level, xpIntoLevel, xpForNextLevel, freezeTokens }`) so `/me` and `StreakCard` need no prop changes.

- [ ] **Step 1: `useXp` hook**

```ts
"use client";

import { useReadContract } from "wagmi";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";
import { xpProgress } from "@/lib/xp";

export function useXp(address?: string) {
  const { data: xpRaw, refetch } = useReadContract({
    address: XP_ADDRESS,
    abi: XP_ABI,
    functionName: "xp",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });
  const { data: canClaim } = useReadContract({
    address: XP_ADDRESS,
    abi: XP_ABI,
    functionName: "canClaim",
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });

  const xp = xpRaw ? Number(xpRaw as bigint) : 0;
  return { xp, canClaim: canClaim === true, refetch, ...xpProgress(xp) };
}
```

- [ ] **Step 2: Rework `useProfile`**

`useProfile` now reads XP on-chain (via `useXp`) and freeze tokens from `/api/profile`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { useXp } from "./useXp";

export interface ProfileView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  freezeTokens: number;
}

export function useProfile(address?: string): { profile: ProfileView | null } {
  const { xp, level, xpIntoLevel, xpForNextLevel } = useXp(address);
  const { data: freeze } = useQuery({
    queryKey: ["freeze", address],
    enabled: !!address,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const res = await fetch(`/api/profile?address=${address}`, { cache: "no-store" });
      if (!res.ok) return 0;
      const json = (await res.json()) as { profile: { freezeTokens: number } | null };
      return json.profile?.freezeTokens ?? 0;
    },
  });

  if (!address) return { profile: null };
  return {
    profile: { xp, level, xpIntoLevel, xpForNextLevel, freezeTokens: freeze ?? 0 },
  };
}
```

- [ ] **Step 3: Trim the profile route** — `frontend/app/api/profile/route.ts` returns freeze only:

```ts
import { NextResponse } from "next/server";
import { readProfile } from "@/lib/oracle/profileStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return NextResponse.json({ profile: null }, { status: 400 });
  const stored = await readProfile(address);
  const profile = stored ? { freezeTokens: stored.freezeTokens } : null;
  return NextResponse.json({ profile }, { headers: { "cache-control": "no-store" } });
}
```

- [ ] **Step 4: Update route test** (`route.test.ts`) to expect `{ profile: { freezeTokens } | null }` (drop the xp/level assertions).

- [ ] **Step 5: `useProfile.test.ts`** — mock `useXp` and `fetch`; assert the composed `ProfileView` merges on-chain xp/level with KV `freezeTokens`, and returns `null` without an address.

- [ ] **Step 6: Run tests**

Run: `cd frontend && npx vitest run hooks/useProfile.test.ts hooks/useXp.test.ts app/api/profile/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/hooks/useXp.ts frontend/hooks/useProfile.ts frontend/app/api/profile/route.ts frontend/app/api/profile/route.test.ts frontend/hooks/useProfile.test.ts
git commit -m "feat(frontend): read XP on-chain; profile route returns freeze only"
```

---

### Task 6: Home "Daily XP" claim card

**Files:**
- Create: `frontend/components/DailyXpCard.tsx` (extracted claim surface)
- Modify: `frontend/app/page.tsx` (replace the inline Daily XP block with `<DailyXpCard>`)
- Test: `frontend/components/DailyXpCard.test.tsx`

**Interfaces:**
- Consumes: `useClaimXp`, `useXp` (`canClaim`, `xp`, `refetch`), `dailyXp` (from `useReadContract` on `XP_ABI dailyXp`, or a constant default of 10), the current-week claimed-days marks.
- Produces: `<DailyXpCard address entered currentDayIndex />`.

- [ ] **Step 1: Build `DailyXpCard`** — states:
  - **not entered**: card hidden (parent only renders when `stats?.entered`).
  - **claimable** (`canClaim`): primary button `Claim today's XP · +{dailyXp}` → `claim()`; while `step==="claiming"` show `Claiming…`.
  - **claimed today** (`!canClaim` or `step==="done"`): `Claimed +{dailyXp} today` with the green check, button disabled.
  - Keep the green accent bar; keep the **7-dot week** row, each dot filled if that weekday has been claimed this week (derive from a per-day marker; for v1 mark days `< currentDayIndex` as claimed-or-not via the `Claimed` events read, else render today highlighted and past neutral — display-only, acceptable to approximate).
  - Helper line: `Claim your XP each day.`
  - After a successful claim, call `useXp().refetch()` and optimistically flip to claimed.

  Use the existing card classes (`card !p-4 relative overflow-hidden`, `chip chip-forest`, `bg-forest` accent bar) from the current Daily XP block so styling is consistent.

- [ ] **Step 2: Wire into `page.tsx`** — replace the existing `{isConnected && stats?.entered && (<div className="card !p-4 relative overflow-hidden">…Daily XP…</div>)}` block with:

```tsx
{isConnected && stats?.entered && (
  <DailyXpCard address={address} currentDayIndex={currentDayIndex} />
)}
```

Remove the now-unused `xpForDay` import/usage tied to the old ladder if nothing else needs it.

- [ ] **Step 3: `DailyXpCard.test.tsx`** — mock `useClaimXp`/`useXp`; assert:
  - renders `Claim today's XP` when `canClaim`,
  - renders `Claimed` state when `!canClaim`,
  - clicking the button calls `claim()`.

- [ ] **Step 4: Run tests + build**

Run: `cd frontend && npx vitest run components/DailyXpCard.test.tsx && npm run build`
Expected: PASS + `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/DailyXpCard.tsx frontend/components/DailyXpCard.test.tsx frontend/app/page.tsx
git commit -m "feat(frontend): Daily XP card becomes the on-chain claim surface"
```

---

### Task 7: Oracle — drop `awardXp`, re-source freeze grants from on-chain XP

**Files:**
- Modify: `frontend/lib/oracle/run.ts` (remove `awardXp`; add freeze-grant pass)
- Modify: `frontend/lib/oracle/profileStore.ts` (`Profile` → freeze-only; remove `awardXp`; add `grantFreezesFor`)
- Modify: `frontend/lib/oracle/run.test.ts`, `frontend/lib/oracle/profileStore.test.ts`

**Interfaces:**
- Consumes: `XP_ADDRESS`/`XP_ABI` (read `xp(player)` for the round's players), `levelForXp`, `grantFreezes`, `FREEZE_CAP`.
- Produces: `Profile = { freezeTokens; lastFreezeMilestone; freezeUsedRound }`; `grantFreezesFor(address, level)`.

- [ ] **Step 1: Shrink `Profile` + add `grantFreezesFor`** in `profileStore.ts`
  - `Profile` interface drops `xp` and `cursor`.
  - `normalize` drops those fields.
  - Remove `awardXp` and its `computeXpGrant` import.
  - Add:

```ts
import { levelForXp, grantFreezes } from "@/lib/xp";
import { FREEZE_CAP } from "./scoreConfig";

/** Grant freeze tokens for a player based on their (on-chain) XP level. Idempotent
 *  via lastFreezeMilestone; non-fatal reads. */
export async function grantFreezesFor(address: string, level: number): Promise<void> {
  let stored: Profile | null;
  try {
    stored = await readProfile(address);
  } catch {
    return;
  }
  const p = stored ?? { freezeTokens: 0, lastFreezeMilestone: 0, freezeUsedRound: null };
  const { freezeTokens, lastFreezeMilestone } = grantFreezes(
    p.freezeTokens, p.lastFreezeMilestone, level, FREEZE_CAP
  );
  if (freezeTokens !== p.freezeTokens || lastFreezeMilestone !== p.lastFreezeMilestone) {
    await writeProfile(address, { ...p, freezeTokens, lastFreezeMilestone });
  }
}
```

- [ ] **Step 2: Replace the XP block in `run.ts`**
  - Delete the `awardXp(qualifying, …)` call and its import.
  - After the provisional write (players known), add a freeze pass that reads on-chain XP for the round's players via a `publicClient.multicall` of `XP_ABI.xp(player)`, computes `levelForXp`, and calls `grantFreezesFor`. Wrap in try/catch (non-fatal), matching the existing `awardXp` error handling.

```ts
import { levelForXp } from "@/lib/xp";
import { grantFreezesFor } from "./profileStore";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";
// ...
try {
  const players = roundInfo.players;
  const results = await publicClient.multicall({
    contracts: players.map((p) => ({
      address: XP_ADDRESS, abi: XP_ABI, functionName: "xp", args: [p],
    })),
    allowFailure: true,
  });
  await Promise.all(
    players.map((p, i) => {
      const r = results[i];
      const xp = r.status === "success" ? Number(r.result as bigint) : 0;
      return grantFreezesFor(p, levelForXp(xp));
    })
  );
} catch (e) {
  console.warn(`Oracle: freeze grant pass failed: ${(e as Error).message}`);
}
```

- [ ] **Step 3: Update tests**
  - `profileStore.test.ts`: remove `awardXp` tests; add `grantFreezesFor` tests (grants at a milestone level, idempotent on a second call, non-fatal on read error). Keep `readProfile`/`writeProfile` tests with the freeze-only shape.
  - `run.test.ts`: drop assertions that `awardXp` is called; assert the freeze pass runs (mock `grantFreezesFor` and the multicall) and that no XP award happens.

- [ ] **Step 4: Run the full suite + build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: all green + `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/oracle/run.ts frontend/lib/oracle/profileStore.ts frontend/lib/oracle/run.test.ts frontend/lib/oracle/profileStore.test.ts
git commit -m "refactor(oracle): drop awardXp; re-source freeze grants from on-chain XP"
```

---

## Cutover / deploy (post-implementation, manual)

1. Deploy: `cd contracts && npx hardhat run scripts/deploy.ts --network celo` → note `StreakXP`.
2. Fill `DEPLOYED_ADDRESSES[42220].streakXp` and `contracts/deployments/celo.json`.
3. Verify: `npx hardhat run scripts/verify.ts --network celo` (or the printed `hardhat verify` line).
4. Set `NEXT_PUBLIC_XP_ADDRESS` in Vercel (build-time — redeploy after).
5. Fresh start (optional cleanliness): clear KV `profile:*` so freeze state re-derives from zero on-chain XP.
6. Announce the XP reset to the community.

## Self-Review notes

- Spec coverage: contract (T1), deploy/wiring (T2–T3), claim (T4), read/profile (T5), UI (T6), oracle/freeze (T7), cutover (manual) — all spec sections mapped.
- Type consistency: `ProfileView` shape preserved for `/me` + `StreakCard`; `Profile` (KV) shrinks consistently across `profileStore` + route + tests; `XP_ABI` function names match the contract (`claimDaily`, `xp`, `canClaim`, `dailyXp`, `lastClaimDay`).
- The 7-dot "claimed this week" marking is display-only and approximated in v1 (per user: ship it, refine later).
