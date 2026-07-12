/**
 * todayActivity.ts
 * Client-side check: has the connected player made a qualifying outgoing tx in
 * today's round-day window? Drives the optimistic "Today's in" state so the UI
 * feels live even though the oracle finalizes a day's streak only after it
 * closes.
 */
import { DAY } from "./roundDay";

export function hasOutgoingToday(
  txs: Array<{ to: string | null; timestamp: number }>,
  todayStart: number,
  player: string
): boolean {
  const p = player.toLowerCase();
  const end = todayStart + DAY;
  return txs.some(
    (tx) =>
      tx.timestamp >= todayStart &&
      tx.timestamp < end &&
      tx.to != null &&
      tx.to.toLowerCase() !== p
  );
}
