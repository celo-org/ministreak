import { toDataSuffix } from "@gigahierz/builder-codes";
import type { Hex } from "viem";

/**
 * Celo Builder Code attribution.
 *
 * Every on-chain transaction a user signs (approve, enterRound, claimRefund,
 * claimDaily) carries this code as an ERC-8021 calldata suffix, making the
 * activity attributable to MiniStreak in Celo's builder-attribution dashboard.
 * The suffix is appended to calldata by the app, so it is wallet-agnostic — it
 * works identically in MiniPay and browser wallets (MetaMask, Rabby, …).
 *
 * This is MiniStreak's registered Celo builder code (fixed, not hostname-derived),
 * so attribution stays stable across production, preview URLs, and localhost.
 */
export const BUILDER_CODE = "celo_nqu4usqw" as const;

export const BUILDER_SUFFIX = toDataSuffix(BUILDER_CODE) as Hex;
