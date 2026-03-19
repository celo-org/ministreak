"use client";

import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isLoading?: boolean;
  showPrizes?: boolean;
  maxRows?: number;
  highlightAddress?: string;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function rankBadge(rank: number) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function Leaderboard({
  entries,
  isLoading,
  showPrizes = true,
  maxRows,
  highlightAddress,
}: LeaderboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-gray-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="card text-center text-gray-500 py-8">
        No players yet this round.
      </div>
    );
  }

  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-12 text-xs text-gray-500 px-3 pb-1">
        <span className="col-span-1">#</span>
        <span className="col-span-4">Wallet</span>
        <span className="col-span-2 text-center">Streak</span>
        <span className="col-span-1 text-center">Txs</span>
        <span className="col-span-2 text-center">Uniq</span>
        {showPrizes && <span className="col-span-2 text-right">Prize</span>}
      </div>

      {displayedEntries.map((entry) => {
        const isMe =
          highlightAddress &&
          entry.address.toLowerCase() === highlightAddress.toLowerCase();
        const prevEntry = entries[entries.indexOf(entry) - 1];
        const isTied =
          prevEntry &&
          prevEntry.streak === entry.streak &&
          prevEntry.txCount === entry.txCount &&
          prevEntry.uniqueToCount === entry.uniqueToCount;

        return (
          <div
            key={entry.address}
            className={`grid grid-cols-12 items-center py-3 px-3 rounded-xl border transition-colors ${
              isMe
                ? "bg-celo-green/10 border-celo-green/40"
                : "bg-gray-900 border-gray-800"
            }`}
          >
            <span className="col-span-1 text-lg">{rankBadge(entry.rank)}</span>

            <div className="col-span-4">
              <p className={`text-sm font-mono ${isMe ? "text-celo-green font-bold" : "text-gray-200"}`}>
                {truncateAddress(entry.address)}
                {isMe && <span className="ml-1 text-xs">(you)</span>}
              </p>
            </div>

            <div className="col-span-2 text-center">
              <span className="text-sm font-bold text-white">
                {entry.streak}
                {entry.streak > 0 && " "}
                {entry.streak >= 7
                  ? "🔥"
                  : entry.streak >= 4
                  ? "⚡"
                  : entry.streak > 0
                  ? "✨"
                  : ""}
              </span>
              {isTied && (
                <p className="text-xs text-celo-gold">tied</p>
              )}
            </div>

            <div className="col-span-1 text-center">
              <span className="text-xs text-gray-400">{entry.txCount}</span>
            </div>

            <div className="col-span-2 text-center">
              <span className="text-xs text-gray-400">{entry.uniqueToCount}</span>
            </div>

            {showPrizes && (
              <div className="col-span-2 text-right">
                <span className="text-xs text-celo-gold font-medium">
                  {parseFloat(entry.estimatedPrize) > 0
                    ? `$${entry.estimatedPrize}`
                    : "—"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
