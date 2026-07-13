# Mainnet Deployment Prep: Calldata Suffix, Entry Fee, Deploy Readiness

**Date:** 2026-04-03
**Status:** Draft

## Overview

Prepare MiniStreak for Celo mainnet deployment with three changes:

1. Append a "ministreak" tracking suffix to every transaction originating from the miniapp
2. Reduce entry fee from 0.50 USDT to 0.10 USDT
3. Ensure deploy tooling and env config are mainnet-ready

## 1. Ministreak Calldata Suffix

### Goal

Every transaction sent from the miniapp (approve, enterRound, quick streak tx, etc.) must have a tracking suffix appended to its `data` field. This applies regardless of whether the user is on MiniPay or a desktop browser wallet.

### Suffix Format

```
[existing calldata]
+ [UTF-8 bytes of "ministreak"]   → 0x6d696e69737472656b (10 bytes)
+ [1-byte code length]            → 0x0a (10)
+ [0x00 schema byte]              → 0x00
+ [16-byte marker]                → 0x80218021802180218021802180218021
```

Total suffix: 28 bytes appended to whatever `data` the transaction already has. For transactions with no existing data (plain value transfers), the suffix becomes the entire `data` field.

### Implementation: Connector Provider Wrapping

**File:** `frontend/lib/ministreakSuffix.ts` (new)

Create a utility module that:

1. **Precomputes the suffix** as a hex string constant using viem's `toHex`/`concatHex`:
   - `stringToHex("ministreak")` for the UTF-8 bytes
   - `0x0a` for the length byte
   - `0x00` for the schema byte
   - `0x80218021802180218021802180218021` for the marker
   - Concatenated into a single constant `MINISTREAK_SUFFIX`

2. **Exports `appendSuffix(data?: Hex): Hex`** — if `data` is undefined/empty, returns `0x` + suffix. Otherwise returns `data` + suffix (strip `0x` from suffix before concatenating).

3. **Exports `wrapProviderWithSuffix(provider: EIP1193Provider): EIP1193Provider`** — returns a proxy that intercepts the `request` method:
   - If `method === "eth_sendTransaction"`: clone `params[0]`, set `params[0].data = appendSuffix(params[0].data)`, forward to original provider
   - All other methods: pass through unchanged

**File:** `frontend/lib/wagmi.ts` (modified)

Wrap each connector so its provider gets the suffix treatment:

```ts
import { wrapProviderWithSuffix } from "./ministreakSuffix";

// After creating each connector, wrap it:
function wrapConnector(connector: CreateConnectorFn): CreateConnectorFn {
  return (config) => {
    const result = connector(config);
    const originalGetProvider = result.getProvider.bind(result);
    result.getProvider = async (...args) => {
      const provider = await originalGetProvider(...args);
      return wrapProviderWithSuffix(provider);
    };
    return result;
  };
}
```

Apply `wrapConnector` to both `injected()` and `walletConnect()` in the `createConfig` call.

### Why This Approach

- **Single interception point** — no changes to any hooks or components
- **Works with MiniPay** — MiniPay uses `window.ethereum` (injected provider); wrapping the connector's `getProvider` intercepts before the provider is used
- **Works with desktop wallets** — MetaMask and WalletConnect both go through the same connector wrapping
- **Future-proof** — any new transaction hook automatically gets the suffix

### Edge Cases

- **Plain value transfers** (e.g., TxShortcut sending 0.001 CELO): `data` is undefined, so suffix becomes the entire data field. This is valid — EVM ignores trailing calldata on EOA transfers.
- **Contract calls** (e.g., enterRound, approve): suffix is appended after the ABI-encoded calldata. The EVM ignores extra trailing bytes in calldata, so contract execution is unaffected.
- **Gas estimation**: The suffix adds 28 bytes to calldata, which costs ~(28 * 16) = 448 extra gas for non-zero bytes. Negligible.

## 2. Entry Fee: 0.50 USDT -> 0.10 USDT

### Changes

| File | Change |
|------|--------|
| `contracts/src/MiniStreak.sol:28` | `ENTRY_FEE = 500_000` -> `ENTRY_FEE = 100_000` |
| `contracts/src/MiniStreak.sol:27` | Update NatSpec: "0.5 USDT" -> "0.1 USDT" |
| `contracts/src/MiniStreak.sol:13` | Update contract-level NatSpec: "0.5 USDT" -> "0.1 USDT" |
| `frontend/lib/contracts.ts:26` | `BigInt("500000")` -> `BigInt("100000")`, update comment |
| `frontend/components/EntryButton.tsx:71` | "0.5 USDT" -> "0.1 USDT" |
| `frontend/app/page.tsx:149` | "0.5 USDT" -> "0.1 USDT" |

Since `ENTRY_FEE` is a Solidity `constant`, it is baked into bytecode. The change takes effect on the fresh mainnet deploy — no upgrade mechanism needed.

### Contract Tests

Existing tests reference `ENTRY_FEE` from the contract, so they should continue to pass as long as they read the constant rather than hardcoding `500_000`. Verify and fix any hardcoded values in tests.

## 3. Mainnet Deployment Readiness

### Already Working

- `hardhat.config.ts` has `celo` network (chainId 42220, RPC `https://forno.celo.org`)
- `deploy.ts` supports `--network celo` and has mainnet USDT address `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`
- `wagmi.ts` `getActiveChain()` returns `celo` when `NEXT_PUBLIC_CHAIN_ID=42220`
- `etherscan` config has Celo mainnet verification via celoscan.io

### Changes Needed

| File | Change |
|------|--------|
| `contracts/package.json` | Add `deploy:mainnet` and `verify:mainnet` npm scripts |
| `contracts/.env.example` | Document mainnet env vars (DEPLOYER_PRIVATE_KEY, TREASURY_ADDRESS, ORACLE_HOT_WALLET) |
| `frontend/.env.example` | Document mainnet env vars (NEXT_PUBLIC_CHAIN_ID=42220, contract addresses, RPC URL) |
| `oracle-service/.env.example` | Document mainnet env vars if not already present |

### Mainnet Deploy Checklist (for reference, not automated)

1. Fund deployer wallet with CELO on mainnet
2. Set `DEPLOYER_PRIVATE_KEY`, `TREASURY_ADDRESS`, `ORACLE_HOT_WALLET` in `contracts/.env`
3. Verify mainnet USDT address is correct: `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e`
4. Run `npm run deploy:mainnet`
5. Verify contracts on celoscan: `npm run verify:mainnet`
6. Update `frontend/.env.local` with mainnet contract addresses and `NEXT_PUBLIC_CHAIN_ID=42220`
7. Deploy frontend to Vercel with mainnet env vars
8. Configure oracle-service with mainnet addresses and start

## Files Modified

- `contracts/src/MiniStreak.sol` — entry fee constant
- `contracts/package.json` — npm scripts
- `contracts/.env.example` — mainnet env documentation
- `frontend/lib/ministreakSuffix.ts` — new file, suffix utility + provider wrapper
- `frontend/lib/wagmi.ts` — wrap connectors with suffix
- `frontend/lib/contracts.ts` — entry fee constant
- `frontend/.env.example` — mainnet env documentation
- `frontend/components/EntryButton.tsx` — entry fee display text
- `frontend/app/page.tsx` — rules section entry fee text
