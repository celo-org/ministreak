/**
 * rateCap.ts
 * Anti-farm rate cap: from a set of txs, keep at most one per time window.
 * Greedy earliest-first — keeps the first tx, then only txs that fall at least
 * `windowSeconds` after the last kept one. Pure; does not mutate its input.
 */
export function rateCapTxs<T extends { timestamp: number }>(
  txs: T[],
  windowSeconds: number
): T[] {
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
  const kept: T[] = [];
  let lastKept = -Infinity;
  for (const tx of sorted) {
    if (tx.timestamp - lastKept >= windowSeconds) {
      kept.push(tx);
      lastKept = tx.timestamp;
    }
  }
  return kept;
}
