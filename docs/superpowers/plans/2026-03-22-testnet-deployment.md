# Celo Sepolia Testnet Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare and deploy MiniStreak to Celo Sepolia testnet with Vercel frontend, verified contracts, and updated documentation.

**Architecture:** Contracts already deployed on Celo Sepolia (Vault: 0x911BD7790a581831BbE544bC782cc78659ce41b8, Oracle: 0x6827D8155eF79a7f2d8eA87f8E64b04b3E6936D7). Need to verify contracts, fix frontend for MiniPay, deploy to Vercel, configure oracle service, and update README.

**Tech Stack:** Hardhat, Next.js 14, Vercel, Blockscout, MiniPay, Celo Sepolia

---

### Task 1: Fix contracts/.env for Celo Sepolia

**Files:**
- Modify: `contracts/.env`

- [ ] **Step 1: Add 0x prefix to private key**

The private key needs `0x` prefix for Hardhat to parse correctly.

- [ ] **Step 2: Verify .env has all required variables for verification**

Ensure BLOCKSCOUT_API_KEY is present (placeholder is fine for Blockscout).

---

### Task 2: Verify contracts on Blockscout

**Files:**
- Read: `contracts/deployments/celoSepolia.json`

- [ ] **Step 1: Run contract verification**

Run: `cd contracts && npm run verify:sepolia`

- [ ] **Step 2: Confirm verification on Blockscout**

Check that both MiniStreak and StreakOracle show as verified.

---

### Task 3: Fix frontend for MiniPay deployment

**Files:**
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Add viewport export with MiniPay safe area support**

```typescript
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};
```

- [ ] **Step 2: Verify frontend builds clean**

Run: `cd frontend && npm run build`

---

### Task 4: Code review before deployment

- [ ] **Step 1: Run contract tests to confirm all pass**

Run: `cd contracts && npm test`

- [ ] **Step 2: Run frontend type-check and lint**

Run: `cd frontend && npm run type-check && npm run lint`

- [ ] **Step 3: Review frontend .env.local has correct Celo Sepolia addresses**

Verify addresses match deployments/celoSepolia.json.

---

### Task 5: Deploy frontend to Vercel

**Files:**
- Modify: `frontend/.env.local` (if needed)

- [ ] **Step 1: Verify frontend/.env.local is correct for Celo Sepolia**

- [ ] **Step 2: Build and test locally first**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Deploy to Vercel**

User deploys via Vercel dashboard or CLI with env vars.

---

### Task 6: Update README with deployment info

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update contract address table with deployed addresses**
- [ ] **Step 2: Fix contract name references (CeloGrindVault → MiniStreak)**
- [ ] **Step 3: Fix entry fee (1 USDT → 0.5 USDT)**
- [ ] **Step 4: Add .env variables reference section**
- [ ] **Step 5: Add MiniPay dev mode testing instructions**

---

### Task 7: Configure oracle service .env

**Files:**
- Create: `oracle-service/.env`

- [ ] **Step 1: Create oracle .env from template with deployed addresses**

Uses deployer key as oracle key per user request.
