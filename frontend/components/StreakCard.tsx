"use client";

import { StreakIcon, FreezeIcon } from "@/components/icons";

interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  optimistic?: boolean;
  isLoading?: boolean;
  profile?: { level: number; freezeTokens: number };
}

export default function StreakCard({
  streak,
  todayDone,
  optimistic,
  isLoading,
  profile,
}: StreakCardProps) {
  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-16 bg-paper-tint rounded-xl" />
      </div>
    );
  }

  const freezes = profile?.freezeTokens ?? 0;

  return (
    <div className={`relative overflow-hidden ${todayDone ? "card-accent" : "card"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="chip chip-amber w-12 h-12 rounded-2xl flex-shrink-0">
            <StreakIcon width={28} height={28} />
          </div>
          <div className="min-w-0">
            <p className="font-display font-semibold text-lg leading-tight">
              {streak > 0 ? `${streak}-day streak` : "Start your streak today"}
            </p>
            {profile && (
              <p className="text-ink-mute text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="num">Lv {profile.level}</span>
                {freezes > 0 && (
                  <>
                    <span className="text-ink-faint">·</span>
                    <span className="inline-flex items-center gap-1 text-berry font-semibold num">
                      <FreezeIcon width={12} height={12} /> {freezes}{" "}
                      {freezes === 1 ? "freeze" : "freezes"} banked
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          {todayDone ? (
            <span className="pill-forest">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              {optimistic ? "Today’s in · confirming" : "Today’s in"}
            </span>
          ) : (
            <span className="pill-muted">Pending today</span>
          )}
        </div>
      </div>

      {!todayDone && streak > 0 && (
        <div className="mt-3 px-4 py-2.5 rounded-2xl bg-coral-tint border border-coral/30 text-coral text-sm">
          Send a transaction on Celo today to keep your streak alive.
        </div>
      )}
      <span className="absolute left-5 right-5 bottom-0 h-[3px] rounded-full bg-amber" />
    </div>
  );
}
