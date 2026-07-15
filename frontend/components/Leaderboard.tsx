"use client";

import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { pseudonymFor, shortAddress, monogram, avatarColor } from "@/lib/pseudonym";
import { MedalIcon } from "@/components/icons";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isLoading?: boolean;
  showPrizes?: boolean;
  maxRows?: number;
  highlightAddress?: string;
  updatedAt?: number; // unix seconds; when set, renders a LIVE badge
}

export default function Leaderboard({
  entries,
  isLoading,
  showPrizes = true,
  maxRows,
  highlightAddress,
  updatedAt,
}: LeaderboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-paper-tint rounded-2xl animate-pulse" />
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

  // Only badge as LIVE while the provisional snapshot is actually fresh — within
  // the oracle's ~10-min cadence plus a little refetch slack. Stale or absent →
  // no badge (don't claim "live" on old data, and don't surface a growing age).
  const LIVE_MAX_AGE_SEC = 11 * 60;
  const isLive =
    updatedAt !== undefined && Date.now() / 1000 - updatedAt <= LIVE_MAX_AGE_SEC;

  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="space-y-2">
      {isLive && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-cap text-forest">
          <span className="h-1.5 w-1.5 rounded-full bg-forest animate-pulse" />
          LIVE
        </div>
      )}

      {displayedEntries.map((entry) => {
        const isMe =
          highlightAddress &&
          entry.address.toLowerCase() === highlightAddress.toLowerCase();
        const name = pseudonymFor(entry.address);

        return (
          <div key={entry.address} className={`lbrow ${isMe ? "me" : ""}`}>
            <div className="w-5 flex-shrink-0 grid place-items-center">
              {entry.rank === 1 ? (
                <MedalIcon width={18} height={18} className="text-gold-bright" />
              ) : (
                <span className="font-display font-semibold text-[13px] text-ink-mute num">
                  {entry.rank}
                </span>
              )}
            </div>

            <div
              className="avatar w-8 h-8 text-[12px] flex-shrink-0"
              style={{ background: avatarColor(entry.address) }}
            >
              {monogram(name)}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`font-display font-semibold text-sm truncate leading-tight ${isMe ? "text-forest-deep" : "text-ink"}`}>
                {isMe ? "You" : name}
              </p>
              <p className="font-mono text-[10.5px] text-ink-faint truncate">
                {shortAddress(entry.address)}
              </p>
            </div>

            <div className="text-right flex-shrink-0">
              <p className="font-display font-semibold text-[15px] num leading-none text-ink">
                {entry.streak}
              </p>
              <p
                className="text-[9.5px] uppercase tracking-cap text-ink-mute mt-0.5"
                title="rate-capped activity — spamming doesn't help"
              >
                {entry.txCount} pts
              </p>
            </div>

            {showPrizes && (
              <div className="w-11 text-right flex-shrink-0">
                {parseFloat(entry.estimatedPrize) > 0 ? (
                  <span className="font-display text-xs font-semibold text-forest num">
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
