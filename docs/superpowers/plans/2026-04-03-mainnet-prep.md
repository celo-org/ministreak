# Mainnet Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare MiniStreak for Celo mainnet: append "ministreak" tracking suffix to all frontend transactions, reduce entry fee to 0.10 USDT, and finalize deploy tooling.

**Architecture:** Frontend-level transaction interception via wagmi connector wrapping — a `wrapConnector` HOF intercepts each connector's provider and appends a 28-byte suffix to every `eth_sendTransaction` call's `data` field. Contract changes are a single constant update (ENTRY_FEE). Deploy tooling already supports mainnet; only a missing verify script alias needs adding.

**Tech Stack:** viem ^2.9.0, wagmi ^2.8.0, Solidity 0.8.20, Hardhat

---

### Task 1: Create ministreak suffix utility

**Files:**
- Create: `frontend/lib/ministreakSuffix.ts`

- [ ] **Step 1: Create `frontend/lib/ministreakSuffix.ts`**

```ts
/**
 * ministreakSuffix.ts
 * Appends a "ministreak" tracking suffix to every transaction's data field.
 *
 * Suffix format:
 *   [UTF-8 bytes of "ministreak"] (10 bytes)
 *   + [0x0a]                      (1-byte code length = 10)
 *   + [0x00]                      (schema byte)
 *   + [0x80218021802180218021802180218021] (16-byte marker)
 *
 * Total: 28 bytes appended to existing calldata. The EVM ignores trailing
 * bytes in calldata, so this is safe for both contract calls and plain transfers.
 */

import { type Hex, toHex, concatHex, stringToHex } from "viem";

// Precompute the suffix once at module load
const CODE_HEX = stringToHex("ministreak"); // 0x6d696e69737472656b
const LENGTH_BYTE: Hex = "0x0a"; // 10
const SCHEMA_BYTE: Hex = "0x00";
const MARKER: Hex = "0x80218021802180218021802180218021";

export const MINISTREAK_SUFFIX: Hex = concatHex([
  CODE_HEX,
  LENGTH_BYTE,
  SCHEMA_BYTE,
  MARKER,
]);

/**
 * Append the ministreak suffix to a transaction's data field.
 * If data is undefined/empty, the suffix becomes the entire data field.
 */
export function appendSuffix(data?: Hex | undefined): Hex {
  if (!data || data === "0x") {
    return MINISTREAK_SUFFIX;
  }
  return concatHex([data, MINISTREAK_SUFFIX]);
}
```

- [ ] **Step 2: Verify the suffix hex is correct**

Run in the project root:

```bash
cd frontend && npx tsx -e "
  import { stringToHex, concatHex } from 'viem';
  const code = stringToHex('ministreak');
  const suffix = concatHex([code, '0x0a', '0x00', '0x80218021802180218021802180218021']);
  console.log('code:', code);
  console.log('suffix:', suffix);
  console.log('suffix byte length:', (suffix.length - 2) / 2);
"
```

Expected: suffix byte length = 28, code = `0x6d696e69737472656b`

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/ministreakSuffix.ts
git commit -m "feat: add ministreak calldata suffix utility"
```

---

### Task 2: Wrap wagmi connectors with suffix injection

**Files:**
- Modify: `frontend/lib/wagmi.ts`

- [ ] **Step 1: Add provider wrapping to `frontend/lib/wagmi.ts`**

Add these imports at the top of the file:

```ts
import type { CreateConnectorFn } from "wagmi";
import { appendSuffix } from "./ministreakSuffix";
```

Add the `wrapConnector` function before the `wagmiConfig` export:

```ts
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
      const provider = await originalGetProvider(...args);

      // Only wrap once — tag the provider to avoid double-wrapping on re-renders
      const tagged = provider as typeof provider & { __ministreakWrapped?: boolean };
      if (tagged.__ministreakWrapped) return provider;
      tagged.__ministreakWrapped = true;

      const originalRequest = provider.request.bind(provider);
      provider.request = async (req: { method: string; params?: unknown[] | object }) => {
        if (req.method === "eth_sendTransaction" && Array.isArray(req.params) && req.params[0]) {
          const tx = { ...(req.params[0] as Record<string, unknown>) };
          tx.data = appendSuffix(tx.data as `0x${string}` | undefined);
          return originalRequest({ ...req, params: [tx, ...req.params.slice(1)] });
        }
        return originalRequest(req);
      };

      return provider;
    };

    return result;
  };
}
```

- [ ] **Step 2: Apply `wrapConnector` to all connectors in the config**

Replace the `connectors` array in `createConfig`:

```ts
  connectors: [
    wrapConnector(injected()),
    ...(wcProjectId
      ? [wrapConnector(walletConnect({ projectId: wcProjectId }))]
      : []),
  ],
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/wagmi.ts
git commit -m "feat: wrap wagmi connectors to append ministreak suffix to all txs"
```

---

### Task 3: Change entry fee to 0.10 USDT

**Files:**
- Modify: `contracts/src/MiniStreak.sol:27-28`
- Modify: `frontend/lib/contracts.ts:26`
- Modify: `frontend/components/EntryButton.tsx:71`
- Modify: `frontend/app/page.tsx:149`

- [ ] **Step 1: Update Solidity constant**

In `contracts/src/MiniStreak.sol`, change lines 27-28 from:

```solidity
    /// @notice Entry fee in USDT (0.5 USDT = 500_000 with 6 decimals)
    uint256 public constant ENTRY_FEE = 500_000;
```

to:

```solidity
    /// @notice Entry fee in USDT (0.1 USDT = 100_000 with 6 decimals)
    uint256 public constant ENTRY_FEE = 100_000;
```

- [ ] **Step 2: Update contract-level NatSpec**

In `contracts/src/MiniStreak.sol`, change line 13 from:

```solidity
 * @notice Weekly transaction streak competition on Celo. Players pay 0.5 USDT to enter,
```

to:

```solidity
 * @notice Weekly transaction streak competition on Celo. Players pay 0.1 USDT to enter,
```

- [ ] **Step 3: Run contract tests**

```bash
cd contracts && npm test
```

Expected: All 48 tests pass (they read `ENTRY_FEE` from the contract, not hardcoded).

- [ ] **Step 4: Update frontend constant**

In `frontend/lib/contracts.ts`, change line 26 from:

```ts
export const ENTRY_FEE = BigInt("500000"); // 0.50 USDT (6 decimals)
```

to:

```ts
export const ENTRY_FEE = BigInt("100000"); // 0.10 USDT (6 decimals)
```

- [ ] **Step 5: Update EntryButton UI copy**

In `frontend/components/EntryButton.tsx`, change line 71 from:

```ts
      : "Enter This Week — 0.5 USDT";
```

to:

```ts
      : "Enter This Week — 0.1 USDT";
```

- [ ] **Step 6: Update page.tsx rules copy**

In `frontend/app/page.tsx`, change line 149 from:

```tsx
              1. Pay <strong className="text-white">0.5 USDT</strong> to enter each
```

to:

```tsx
              1. Pay <strong className="text-white">0.1 USDT</strong> to enter each
```

- [ ] **Step 7: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add contracts/src/MiniStreak.sol frontend/lib/contracts.ts frontend/components/EntryButton.tsx frontend/app/page.tsx
git commit -m "feat: reduce entry fee from 0.50 USDT to 0.10 USDT"
```

---

### Task 4: Add verify:mainnet script and finalize env docs

**Files:**
- Modify: `contracts/package.json`
- Modify: `contracts/.env.example`
- Modify: `frontend/.env.example`
- Modify: `oracle-service/.env.example`

- [ ] **Step 1: Add `verify:mainnet` script to contracts/package.json**

Add to the `"scripts"` object:

```json
    "verify:mainnet": "hardhat run scripts/verify.ts --network celo",
```

(`deploy:mainnet` already exists.)

- [ ] **Step 2: Add mainnet comments to `contracts/.env.example`**

Add a mainnet section comment at the top, after the existing USDT_ADDRESS line. Replace the USDT_ADDRESS line:

```bash
# USDT address override (leave blank for Celo Sepolia / Mainnet defaults in deploy.ts)
# Celo Mainnet USDT: 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e (verify at celoscan.io)
USDT_ADDRESS=
```

- [ ] **Step 3: Add mainnet comments to `frontend/.env.example`**

Update the USDT comment:

```bash
# USDT token address
# Celo Sepolia: address printed by deploy:sepolia
# Celo Mainnet: 0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e (verify at celoscan.io)
NEXT_PUBLIC_USDT_ADDRESS=0x0000000000000000000000000000000000000000
```

- [ ] **Step 4: Add mainnet comments to `oracle-service/.env.example`**

Update the RPC comment:

```bash
# Celo RPC endpoint
# Testnet: https://forno.celo-sepolia.celo-testnet.org
# Mainnet: https://forno.celo.org
CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
```

- [ ] **Step 5: Commit**

```bash
git add contracts/package.json contracts/.env.example frontend/.env.example oracle-service/.env.example
git commit -m "chore: add verify:mainnet script and mainnet env documentation"
```
