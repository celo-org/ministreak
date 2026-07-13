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

  const liveLabel = (() => {
    if (updatedAt === undefined) return null;
    const mins = Math.max(0, Math.floor(Date.now() / 1000 - updatedAt) / 60);
    const rounded = Math.floor(mins);
    return rounded < 1 ? "just now" : `${rounded}m ago`;
  })();

  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="space-y-2">
      {liveLabel && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-cap text-forest">
          <span className="h-1.5 w-1.5 rounded-full bg-forest animate-pulse" />
          LIVE · updated {liveLabel}
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
                <span className="font-display font-bold text-[13px] text-ink-mute num">
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
              <p className={`font-display font-bold text-sm truncate leading-tight ${isMe ? "text-forest-deep" : "text-ink"}`}>
                {isMe ? "You" : name}
              </p>
              <p className="font-mono text-[10.5px] text-ink-faint truncate">
                {shortAddress(entry.address)}
              </p>
            </div>

            <div className="text-right flex-shrink-0">
              <p className="font-display font-bold text-[15px] num leading-none text-ink">
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
                  <span className="font-display text-xs font-bold text-forest num">
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
