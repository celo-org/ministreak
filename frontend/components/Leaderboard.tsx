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

function rankLabel(rank: number): { text: string; isTop3: boolean } {
  return { text: `#${rank}`, isTop3: rank <= 3 };
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
          <div key={i} className="h-14 bg-arcade-card rounded-sm animate-pulse" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="card text-center py-8">
        <p className="font-pixel text-arcade-muted" style={{ fontSize: "8px" }}>
          NO PLAYERS YET
        </p>
      </div>
    );
  }

  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-12 font-pixel text-arcade-muted px-3 pb-1" style={{ fontSize: "5px" }}>
        <span className="col-span-1">#</span>
        <span className="col-span-4">WALLET</span>
        <span className="col-span-2 text-center">STREAK</span>
        <span className="col-span-1 text-center">TXS</span>
        <span className="col-span-2 text-center">UNIQ</span>
        {showPrizes && <span className="col-span-2 text-right">PRIZE</span>}
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
        const { text: rankText, isTop3 } = rankLabel(entry.rank);

        return (
          <div
            key={entry.address}
            className={`grid grid-cols-12 items-center py-3 px-3 rounded-sm border transition-colors ${
              isMe
                ? "bg-celo-green/10 border-celo-green/40"
                : "bg-arcade-card border-arcade-dim"
            }`}
          >
            <span
              className={`col-span-1 font-pixel ${
                isTop3 ? "text-celo-gold" : "text-arcade-muted"
              }`}
              style={{ fontSize: "9px" }}
            >
              {rankText}
            </span>

            <div className="col-span-4">
              <p className={`text-xs font-mono ${isMe ? "text-celo-green font-bold" : "text-gray-200"}`}>
                {truncateAddress(entry.address)}
                {isMe && (
                  <span className="font-pixel text-celo-green ml-1" style={{ fontSize: "5px" }}>
                    YOU
                  </span>
                )}
              </p>
            </div>

            <div className="col-span-2 text-center">
              <span className="font-pixel text-celo-green" style={{ fontSize: "9px" }}>
                {entry.streak}
              </span>
              {isTied && (
                <p className="font-pixel text-celo-gold" style={{ fontSize: "5px" }}>
                  TIED
                </p>
              )}
            </div>

            <div className="col-span-1 text-center">
              <span className="text-xs text-arcade-muted">{entry.txCount}</span>
            </div>

            <div className="col-span-2 text-center">
              <span className="text-xs text-arcade-muted">{entry.uniqueToCount}</span>
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
