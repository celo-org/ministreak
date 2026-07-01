import { codeFromHostname, toDataSuffix } from "@gigahierz/builder-codes";
import type { Hex } from "viem";

/**
 * Celo Builder Code attribution.
 *
 * Every on-chain transaction a user signs (approve, enterRound, claimRefund)
 * carries this code as an ERC-8021 calldata suffix, making the activity
 * attributable to MiniStreak in Celo's builder-attribution dashboard. The
 * suffix is appended to calldata by the app, so it is wallet-agnostic — it
 * works identically in MiniPay and browser wallets (MetaMask, Rabby, …).
 *
 * Pattern: hostname-derived code. `codeFromHostname` is a pure function
 * (sha256 of the hostname → `celo_<hash>`) with no wallet / network / window
 * dependency, so it is SSR-safe and independent of any MiniPay integration.
 *
 * The hostname is hardcoded to the canonical production domain on purpose:
 * deriving it from `window.location.hostname` would produce a different code
 * on Vercel preview URLs and localhost, fragmenting attribution.
 */
export const BUILDER_HOSTNAME = "ministreak.app" as const;

export const BUILDER_CODE = codeFromHostname(BUILDER_HOSTNAME); // celo_db78d701

export const BUILDER_SUFFIX = toDataSuffix(BUILDER_CODE) as Hex;
