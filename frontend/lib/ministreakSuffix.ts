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

import { type Hex, concatHex, stringToHex } from "viem";

// Precompute the suffix once at module load
const CODE_HEX = stringToHex("ministreak"); // 0x6d696e6973747265616b
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
