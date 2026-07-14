/**
 * provisional.ts
 * Pure computation of the "today" provisional leaderboard snapshot from the
 * oracle's all-days scan. Display-only: additive to on-chain confirmed values,
 * never a rewrite. KV I/O lives in provisionalStore.ts.
 */
import type { QualifyingTx, RoundInfo } from "./scanner";

export interface ProvisionalPlayer {
  streak: number; // provisional streak through today
  todayScore: number; // today's counted, loyalty-applied points (additive to on-chain)
  todayUniqueTo: number; // today's counted unique recipients (additive)
  active: boolean; // has a qualifying tx today
}

export interface ProvisionalSnapshot {
  roundId: string;
  dayIndex: number; // the open day index
  updatedAt: number; // unix seconds
  players: Record<string, ProvisionalPlayer>; // key = lowercased address
}

export function computeProvisional(
  allDayEntries: QualifyingTx[],
  openDayIndex: number,
  roundInfo: RoundInfo
): ProvisionalSnapshot {
  const byPlayer = new Map<string, QualifyingTx[]>();
  for (const e of allDayEntries) {
    const key = e.player.toLowerCase();
    const list = byPlayer.get(key);
    if (list) list.push(e);
    else byPlayer.set(key, [e]);
  }

  const players: Record<string, ProvisionalPlayer> = {};
  for (const [addr, entries] of byPlayer) {
    const days = new Set(entries.map((e) => e.dayIndex));
    // Provisional streak = consecutive run of active days ending at the most
    // recent active day (the open day if active today, else the last active
    // closed day). Handles the "missed a day -> reset" case.
    const maxDay = Math.max(...days);
    let streak = 0;
    for (let d = maxDay; d >= 0 && days.has(d); d--) streak++;

    const openEntry = entries.find((e) => e.dayIndex === openDayIndex);
    players[addr] = {
      streak,
      todayScore: openEntry?.txCount ?? 0,
      todayUniqueTo: openEntry?.uniqueToCount ?? 0,
      active: openEntry !== undefined,
    };
  }

  return {
    roundId: roundInfo.roundId.toString(),
    dayIndex: openDayIndex,
    updatedAt: Math.floor(Date.now() / 1000),
    players,
  };
}
