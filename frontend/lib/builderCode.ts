import { toDataSuffix } from "@gigahierz/builder-codes";
import type { Hex } from "viem";

/**
 * Celo Builder Code attribution.
 *
 * Every on-chain transaction the app sends carries this issued code as an
 * ERC-8021 calldata suffix, making the activity attributable to MiniStreak
 * in Celo's builder-attribution dashboard.
 *
 * Pattern: issued code (Proof of Ship). Static at build time — no hostname
 * derivation, no `window` access, SSR-safe.
 */
export const BUILDER_CODE = "celo_0xd7zeus" as const;

export const BUILDER_SUFFIX = toDataSuffix(BUILDER_CODE) as Hex;
