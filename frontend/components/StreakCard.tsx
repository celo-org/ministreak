"use client";

import { StreakIcon, FreezeIcon } from "@/components/icons";

interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  optimistic?: boolean;
  isLoading?: boolean;
  profile?: { level: number; xpIntoLevel: number; xpForNextLevel: number; freezeTokens: number };
  todayXp?: number;
}

export default function StreakCard({
  streak,
  todayDone,
  optimistic,
  isLoading,
  profile,
  todayXp,
}: StreakCardProps) {
  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-20 bg-paper-tint rounded-xl" />
      </div>
    );
  }

  const pct = profile
    ? Math.min(100, Math.round((profile.xpIntoLevel / Math.max(1, profile.xpForNextLevel)) * 100))
    : 0;

  return (
    <div className={todayDone ? "card-accent" : "card"}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="chip chip-amber w-11 h-11 rounded-2xl">
            <StreakIcon width={26} height={26} />
          </div>
          <div>
            <p className="eyebrow">Current streak</p>
            <p className="font-display font-bold text-[38px] num leading-none mt-0.5">{streak}</p>
            <p className="text-ink-mute text-xs mt-0.5">
              {streak === 1 ? "day" : "days"} in a row
            </p>
          </div>
        </div>
        <div className="text-right">
          {todayDone ? (
            <span className="pill-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              {optimistic ? "Today’s in · confirming" : "Today’s in"}
            </span>
          ) : (
            <span className="pill-muted">Pending today</span>
          )}
          {todayXp !== undefined && todayXp > 0 && (
            <p className="mt-1 text-[11px] font-bold text-forest num">+{todayXp} XP</p>
          )}
        </div>
      </div>

      {!todayDone && streak > 0 && (
        <div className="mt-4 px-4 py-3 rounded-2xl bg-coral-tint border border-coral/30 text-coral text-sm">
          Send a transaction on Celo today to keep your streak alive.
        </div>
      )}

      {profile && (
        <div className="mt-4 pt-4 border-t border-rule">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="pill-muted num">Lv {profile.level}</span>
              {profile.freezeTokens > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-berry num"
                  title="Streak-freeze tokens"
                >
                  <FreezeIcon width={13} height={13} /> ×{profile.freezeTokens}
                </span>
              )}
            </span>
            <span className="text-[11px] text-ink-mute num">
              {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
            </span>
          </div>
          <div className="bar mt-2">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
