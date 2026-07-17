"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useProfile } from "@/hooks/useProfile";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useTodayActivity } from "@/hooks/useTodayActivity";
import { pseudonymFor, shortAddress, monogram } from "@/lib/pseudonym";
import { roundDayIndex } from "@/lib/roundDay";
import { optimisticStreak } from "@/lib/optimisticStreak";
import { useLoyaltyMultiplier } from "@/hooks/useLoyaltyMultiplier";
import { StreakIcon, ScoreIcon, FreezeIcon, TrophyIcon } from "@/components/icons";
import WalletBadge from "@/components/WalletBadge";

export default function MePage() {
  const { address, isConnected } = useAccount();
  const { data: round } = useCurrentRound();
  const { stats } = usePlayerStats(round?.roundId, address);
  const { profile } = useProfile(address);
  const { hasActivityToday } = useTodayActivity(address, round);
  const multiplier = useLoyaltyMultiplier(address, round?.roundId);

  // Live streak (optimistic ~1 min), matching the Home card + the leaderboard.
  const currentDayIndex = round
    ? roundDayIndex(round.startTime, Math.floor(Date.now() / 1000))
    : -1;
  const todayDone =
    !!stats?.entered &&
    stats.lastValidDay !== 255 &&
    stats.lastValidDay === currentDayIndex;
  const selfStreak = optimisticStreak({
    onChainStreak: Number(stats?.streak ?? 0),
    lastValidDay: stats?.lastValidDay,
    currentDayIndex,
    hasActivityToday,
    todayDone,
  });

  const { data: lb } = useLeaderboard(
    round?.roundId?.toString(),
    address ? { address, streak: selfStreak } : undefined
  );

  if (!isConnected || !address) {
    return (
      <main className="pt-10 space-y-6">
        <header className="flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo_Color.svg" alt="MiniStreak" width={136} height={25} className="h-[25px] w-auto" />
          <WalletBadge />
        </header>
        <div className="card text-center space-y-3 mt-10">
          <p className="text-ink-mute">Connect a wallet to see your profile.</p>
          <WalletBadge />
        </div>
      </main>
    );
  }

  const name = pseudonymFor(address);
  const level = profile?.level ?? 1;
  const freezes = profile?.freezeTokens ?? 0;
  const xpInto = profile?.xpIntoLevel ?? 0;
  const xpFor = profile?.xpForNextLevel ?? 1;

  const entries = lb?.entries ?? [];
  const myRow = entries.find((e) => e.address.toLowerCase() === address.toLowerCase());
  const rank = myRow?.rank;
  const total = entries.length;

  // Streak + Score come from the connected player's live leaderboard row so the
  // profile matches Home/the board (provisional for all, optimistic-bumped for
  // self); fall back to on-chain until the row loads.
  const streak = myRow?.streak ?? selfStreak;
  const score = myRow?.txCount ?? Number(stats?.txCount ?? 0);

  const pct = Math.min(100, Math.round((xpInto / Math.max(1, xpFor)) * 100));

  return (
    <main className="pt-10 pb-4 space-y-5">
      <header className="flex items-center justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_Color.svg" alt="MiniStreak" width={136} height={25} className="h-[25px] w-auto" />
        <WalletBadge />
      </header>

      <h1 className="font-display text-3xl font-semibold tracking-tight">Profile</h1>

      {/* identity */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="avatar w-[90px] h-[90px] text-[32px]">
          {monogram(name)}
          <span className="lvl num">LVL&nbsp;{level}</span>
        </div>
        <div className="font-display text-[23px] font-semibold mt-2">{name}</div>
        <div className="text-ink-mute text-[12.5px] font-mono">{shortAddress(address)}</div>
      </div>

      {/* stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat chip-amber">
          <div className="chip chip-amber"><StreakIcon /></div>
          <div className="stat-big num">{streak}</div>
          <div className="stat-sub">{streak === 1 ? "day" : "days"} in a row</div>
          <div className="stat-lab">Streak</div>
        </div>

        <div className="stat chip-sky stat-tint-sky">
          <div className="chip chip-sky"><ScoreIcon /></div>
          <span
            title="Loyalty boost — enter consecutive rounds to raise it (max ×2)"
            className={`absolute top-3 right-3 text-[10px] font-semibold px-1.5 py-0.5 rounded-full num ${
              multiplier > 1 ? "bg-sky text-white" : "bg-white/70 text-ink-mute"
            }`}
          >
            ×{multiplier}
          </span>
          <div className="stat-big num">{score} <small>pts</small></div>
          <div className="stat-sub">
            {multiplier > 1 ? `this week · ×${multiplier} boost` : "this week"}
          </div>
          <div className="stat-lab">Score</div>
        </div>

        <div className="stat chip-berry stat-tint-berry">
          <div className="chip chip-berry"><FreezeIcon /></div>
          <div className="stat-big num">{freezes}</div>
          <div className="stat-sub">skip a day, keep it</div>
          <div className="stat-lab">Freezes</div>
        </div>

        <div className="stat chip-gold">
          <div className="chip chip-gold"><TrophyIcon /></div>
          <div className="stat-big num">{rank ? `#${rank}` : "—"}</div>
          <div className="stat-sub">{rank ? `of ${total}` : "not entered yet"}</div>
          <div className="stat-lab">Rank</div>
        </div>
      </div>

      {/* XP progress */}
      <div className="card !p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-base font-semibold num">Level {level} → {level + 1}</span>
          <span className="font-display text-[12.5px] font-semibold text-ink-mute num">
            {xpInto} / {xpFor} XP
          </span>
        </div>
        <div className="bar mt-2.5 mb-2"><i style={{ width: `${pct}%` }} /></div>
        <div className="text-[10.5px] text-ink-mute">Earn XP every day you transact</div>
      </div>
    </main>
  );
}
