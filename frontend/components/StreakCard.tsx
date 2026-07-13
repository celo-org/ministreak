"use client";

interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  optimistic?: boolean;
  isLoading?: boolean;
  profile?: { level: number; xpIntoLevel: number; xpForNextLevel: number };
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

  return (
    <div className={todayDone ? "card-accent" : "card"}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow">Current streak</p>
          <p className="display-lg num mt-1">{streak}</p>
          <p className="text-ink-mute text-sm mt-1">
            {streak === 1 ? "day" : "days"} in a row
          </p>
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
            <p className="mt-1 text-[11px] font-semibold text-forest num">+{todayXp} XP</p>
          )}
        </div>
      </div>

      {!todayDone && streak > 0 && (
        <div className="mt-4 px-4 py-3 rounded-xl bg-coral-tint border border-coral/30 text-coral text-sm">
          Send a transaction on Celo today to keep your streak alive.
        </div>
      )}

      {profile && (
        <div className="mt-4 pt-4 border-t border-rule">
          <div className="flex items-center justify-between">
            <span className="pill-muted num">Lv {profile.level}</span>
            <span className="text-[11px] text-ink-mute num">
              {profile.xpIntoLevel} / {profile.xpForNextLevel} XP
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-paper-deep overflow-hidden">
            <div
              className="h-full bg-forest rounded-full"
              style={{
                width: `${Math.min(100, Math.round((profile.xpIntoLevel / Math.max(1, profile.xpForNextLevel)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
