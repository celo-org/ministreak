"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePreviousRoundRefund } from "@/hooks/usePreviousRoundRefund";
import { useTodayActivity } from "@/hooks/useTodayActivity";
import { useProfile } from "@/hooks/useProfile";
import { xpForDay } from "@/lib/xp";
import { pseudonymFor, monogram } from "@/lib/pseudonym";
import StreakCard from "@/components/StreakCard";
import RoundTimer from "@/components/RoundTimer";
import EntryButton from "@/components/EntryButton";
import ClaimRefundCard from "@/components/ClaimRefundCard";
import ResolveRoundButton from "@/components/ResolveRoundButton";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
import LegalLinks from "@/components/Footer";
import { StreakIcon, ScoreIcon } from "@/components/icons";
import { roundDayIndex } from "@/lib/roundDay";
import { useState } from "react";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { useOnboarding } from "@/hooks/useOnboarding";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const [howToOpen, setHowToOpen] = useState(false);
  const onboarding = useOnboarding();

  const { data: round, isError: roundError, refetch: refetchRound } = useCurrentRound();

  const { stats, isLoading: statsLoading } = usePlayerStats(round?.roundId, address);

  // "Done today" is derived on-chain (see roundDay.ts): the player's last
  // recorded streak day equals the current round-day index.
  const nowSec = Math.floor(Date.now() / 1000);
  const currentDayIndex = round ? roundDayIndex(round.startTime, nowSec) : -1;
  const todayDone =
    !!stats?.entered &&
    stats.lastValidDay !== 255 &&
    stats.lastValidDay === currentDayIndex;

  const { hasActivityToday } = useTodayActivity(address, round);
  const optimisticToday = hasActivityToday && !todayDone;

  const { profile } = useProfile(address);
  const todayXp = optimisticToday ? xpForDay(Number(stats?.streak ?? 0) + 1) : undefined;

  const { data: leaderboard, isLoading: lbLoading, updatedAt: lbUpdatedAt } =
    useLeaderboard(round?.roundId?.toString());

  const { isAdmin } = useIsAdmin(address);

  const { info: refundInfo, refetch: refetchRefund } = usePreviousRoundRefund(
    round?.roundId,
    address
  );

  const name = address ? pseudonymFor(address) : "";
  const isReturning = (profile?.xp ?? 0) > 0;
  const streak = Number(stats?.streak ?? 0);
  const dailyXp = xpForDay(streak + 1);

  return (
    <main className="pt-9 space-y-5">
      <OnboardingCarousel open={onboarding.open} onDismiss={onboarding.dismiss} />

      {/* Masthead */}
      <header className="flex items-center justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_Color.svg" alt="MiniStreak" width={136} height={25} className="h-[25px] w-auto" />
        <WalletBadge />
      </header>

      {/* Welcome row — "Welcome back" only for a returning player */}
      {isConnected && stats?.entered && (
        <div className="flex items-center gap-3">
          <div className="avatar w-11 h-11 text-[15px]">{monogram(name)}</div>
          <div className="min-w-0 flex-1">
            {isReturning && (
              <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink-mute">
                Welcome back
              </div>
            )}
            <div className="font-display font-bold text-lg leading-tight truncate">{name}</div>
          </div>
          {streak > 0 && (
            <span className="pill-stat chip-amber">
              <span className="dot"><StreakIcon /></span>
              <b>{streak}</b>
            </span>
          )}
        </div>
      )}

      {/* Pot hero — round, countdown, and entry all in one card */}
      <section
        className="relative overflow-hidden rounded-[22px] p-6 text-white min-h-[168px]"
        style={{
          background: "linear-gradient(140deg,#14603a 0%,#1f7d49 52%,#2f9d7a 100%)",
          boxShadow: "0 16px 30px -20px rgba(15,74,42,0.8)",
        }}
      >
        <div className="absolute -right-5 -bottom-8 opacity-[0.13] pointer-events-none">
          <StreakIcon width={150} height={150} />
        </div>
        {roundError ? (
          <>
            <p className="font-display font-bold text-xl">Contract unreachable</p>
            <p className="text-xs opacity-90 mt-1">Connect to Celo and try again.</p>
          </>
        ) : round ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] opacity-90">
              Round #{round.roundId.toString()} {round.isOpen ? "· Open" : "· Closed"}
            </p>
            <p className="font-display font-bold text-[44px] leading-none mt-1.5 num">
              {round.potFormatted}
              <span className="text-lg opacity-85 font-semibold ml-1.5">USDT</span>
            </p>
            <p className="text-xs opacity-90 mt-1">
              {round.playerCount.toString()}{" "}
              {Number(round.playerCount) === 1 ? "player" : "players"} in the pot
            </p>

            <div className="mt-4">
              <RoundTimer endTime={round.endTime} variant="hero" />
            </div>

            <div className="mt-3.5">
              {isConnected ? (
                <EntryButton
                  variant="hero"
                  roundId={round.roundId}
                  isEntered={stats?.entered ?? false}
                  isOpen={round.isOpen}
                  onSuccess={refetchRound}
                />
              ) : (
                <div className="text-center rounded-2xl bg-white/15 text-white/85 font-display font-bold py-3">
                  Connect a wallet to enter
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="animate-pulse space-y-3" aria-hidden>
            <div className="h-3 w-24 rounded bg-white/25" />
            <div className="h-11 w-44 rounded bg-white/25" />
            <div className="h-3 w-32 rounded bg-white/25" />
            <div className="h-9 w-full rounded-2xl bg-white/20 mt-2" />
          </div>
        )}
      </section>

      {/* Refund claim (previous round, only if claimable) */}
      {isConnected && refundInfo.claimable && refundInfo.roundId !== null && (
        <ClaimRefundCard roundId={refundInfo.roundId} onSuccess={refetchRefund} />
      )}

      {/* Daily XP — make the everyday reward loop obvious */}
      {isConnected && stats?.entered && (
        <div className="card !p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="chip chip-forest w-[30px] h-[30px]"><ScoreIcon /></div>
              <b className="font-display text-sm font-bold">Daily XP</b>
            </div>
            <span className="font-display text-[15px] font-bold text-forest num">+{dailyXp} XP today</span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
              const done = currentDayIndex >= 0 && d < currentDayIndex;
              const today = d === currentDayIndex;
              return (
                <div key={d} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full max-w-[30px] aspect-square rounded-full grid place-items-center font-display font-bold text-[10px] num ${
                      done
                        ? "bg-forest text-white"
                        : today
                        ? "bg-amber text-white ring-[3px] ring-amber-tint"
                        : "bg-paper-deep text-ink-faint"
                    }`}
                  >
                    {d + 1}
                  </div>
                  <span className={`text-[8.5px] num ${today ? "text-amber font-bold" : "text-ink-mute"}`}>
                    +{xpForDay(d + 1)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="text-[10.5px] text-ink-mute mt-2.5">Send a transaction daily to earn XP.</div>
        </div>
      )}

      {/* Streak card (if entered) */}
      {isConnected && stats?.entered && (
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayDone || hasActivityToday}
          optimistic={optimisticToday}
          isLoading={statsLoading}
          profile={profile ?? undefined}
          todayXp={todayXp}
        />
      )}

      {/* Admin: resolve current round */}
      {isConnected && isAdmin && round && (
        <ResolveRoundButton roundId={round.roundId} onSuccess={refetchRound} />
      )}

      {/* Top 5 leaderboard */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display font-bold text-2xl tracking-tight">This week</h2>
          <span className="eyebrow">Top 5</span>
        </div>
        <Leaderboard
          entries={leaderboard?.entries ?? []}
          isLoading={lbLoading}
          showPrizes
          maxRows={5}
          highlightAddress={address}
          updatedAt={lbUpdatedAt}
        />
      </section>

      {/* How to play */}
      <section className="card !p-5">
        <button
          onClick={() => setHowToOpen(!howToOpen)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="font-display font-bold text-lg text-ink tracking-tight">How to play</span>
          <span className={`text-forest text-2xl leading-none transition-transform ${howToOpen ? "rotate-45" : ""}`}>
            +
          </span>
        </button>

        {howToOpen && (
          <ol className="mt-4 space-y-3 text-ink leading-relaxed">
            {[
              <>Pay <strong>0.10 USDT</strong> to enter each week’s round.</>,
              <>Send <strong>any outgoing transaction</strong> every day to build your streak.</>,
              <>Ranking: longest streak, then <strong>Score</strong> (rate-capped activity — spamming doesn’t help), then unique addresses.</>,
              <>Miss a day? <strong>You’re out</strong> — unless you spend a streak-freeze.</>,
              <>Winners split the pot <strong>50 / 30 / 20</strong> (minus 5% fee).</>,
              <>Fewer than 3 players? All entry fees are refunded.</>,
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display font-bold text-forest num shrink-0 w-6">0{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        )}
        <button onClick={onboarding.show} className="mt-4 text-sm text-forest underline">
          Replay intro
        </button>
      </section>

      <LegalLinks />
    </main>
  );
}
