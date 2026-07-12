"use client";

import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { pseudonymFor, shortAddress } from "@/lib/pseudonym";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isLoading?: boolean;
  showPrizes?: boolean;
  maxRows?: number;
  highlightAddress?: string;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

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
          <div key={i} className="h-16 bg-paper-tint rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="card text-center py-10">
        <p className="text-ink-mute">No players yet — be the first.</p>
      </div>
    );
  }

  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="card !p-0 overflow-hidden">
      {displayedEntries.map((entry, idx) => {
        const isMe =
          highlightAddress &&
          entry.address.toLowerCase() === highlightAddress.toLowerCase();
        const isTop3 = entry.rank <= 3;
        const medal = MEDAL[entry.rank];

        return (
          <div
            key={entry.address}
            className={`flex items-center gap-3 px-5 py-4 ${
              idx > 0 ? "border-t border-rule" : ""
            } ${isMe ? "bg-forest-tint/50" : ""}`}
          >
            <div className="w-9 flex-shrink-0 text-center">
              {medal ? (
                <span className="text-xl">{medal}</span>
              ) : (
                <span className="font-sans font-bold text-ink-mute num">
                  {entry.rank}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`truncate ${isMe ? "font-semibold text-forest-deep" : "font-medium text-ink"}`}>
                {isMe ? "You" : pseudonymFor(entry.address)}
              </p>
              <p className="font-mono text-[11px] text-ink-faint truncate">
                {shortAddress(entry.address)}
              </p>
            </div>

            <div className="text-right">
              <p className={`font-sans font-bold text-xl num leading-none ${isTop3 ? "text-gold" : "text-ink"}`}>
                {entry.streak}
              </p>
              <p
                className="text-[10px] uppercase tracking-cap text-ink-mute mt-1"
                title="rate-capped activity — spamming doesn't help"
              >
                {entry.txCount} pts
              </p>
            </div>

            {showPrizes && (
              <div className="w-16 text-right">
                {parseFloat(entry.estimatedPrize) > 0 ? (
                  <span className="text-sm font-semibold text-forest num">
                    ${entry.estimatedPrize}
                  </span>
                ) : (
                  <span className="text-ink-faint text-sm">—</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
