"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePreviousRoundRefund } from "@/hooks/usePreviousRoundRefund";
import { useTodayActivity } from "@/hooks/useTodayActivity";
import { useProfile } from "@/hooks/useProfile";
import { pseudonymFor, monogram } from "@/lib/pseudonym";
import StreakCard from "@/components/StreakCard";
import RoundTimer from "@/components/RoundTimer";
import EntryButton from "@/components/EntryButton";
import ClaimRefundCard from "@/components/ClaimRefundCard";
import ResolveRoundButton from "@/components/ResolveRoundButton";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
import LegalLinks from "@/components/Footer";
import DailyXpCard from "@/components/DailyXpCard";
import { StreakIcon } from "@/components/icons";
import { roundDayIndex } from "@/lib/roundDay";
import { useState } from "react";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { useOnboarding } from "@/hooks/useOnboarding";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const [howToOpen, setHowToOpen] = useState(false);
  const onboarding = useOnboarding(address);

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

  const { profile } = useProfile(address);

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
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-mute">
                Welcome
              </div>
            )}
            <div className="font-display font-semibold text-lg leading-tight truncate">{name}</div>
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
          background: "linear-gradient(150deg,#1f4a37 0%,#2c6248 55%,#3a7259 100%)",
          boxShadow: "0 16px 30px -20px rgba(27,69,49,0.8)",
        }}
      >
        <div className="absolute -right-5 -bottom-8 opacity-[0.13] pointer-events-none">
          <StreakIcon width={150} height={150} />
        </div>
        {roundError ? (
          <>
            <p className="font-display font-semibold text-xl">Contract unreachable</p>
            <p className="text-xs opacity-90 mt-1">Connect to Celo and try again.</p>
          </>
        ) : round ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] opacity-90">
              Round #{round.roundId.toString()} {round.isOpen ? "· Open" : "· Closed"}
            </p>
            <p className="font-display font-semibold text-[44px] leading-none mt-1.5 num">
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
                <div className="text-center rounded-2xl bg-white/15 text-white/85 font-display font-semibold py-3">
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
        <DailyXpCard address={address} currentDayIndex={currentDayIndex} />
      )}

      {/* Streak card (if entered) */}
      {isConnected && stats?.entered && (
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayDone || hasActivityToday}
          isLoading={statsLoading}
          profile={profile ?? undefined}
        />
      )}

      {/* Admin: resolve current round */}
      {isConnected && isAdmin && round && (
        <ResolveRoundButton roundId={round.roundId} onSuccess={refetchRound} />
      )}

      {/* Top 5 leaderboard */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-display font-semibold text-2xl tracking-tight">This week</h2>
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
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setHowToOpen(!howToOpen)}
            className="flex items-center gap-2 text-left"
            aria-expanded={howToOpen}
          >
            <span className="font-display font-semibold text-lg text-ink tracking-tight">How to play</span>
            <span className={`text-forest text-2xl leading-none transition-transform ${howToOpen ? "rotate-45" : ""}`}>
              +
            </span>
          </button>
          <button
            onClick={onboarding.show}
            aria-label="Replay intro"
            title="Replay intro"
            className="grid place-items-center w-9 h-9 rounded-full bg-forest text-white shadow-[0_3px_0_var(--forest-deep)] transition-transform active:translate-y-[2px] flex-shrink-0"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>

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
                <span className="font-display font-semibold text-forest num shrink-0 w-6">0{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <LegalLinks />
    </main>
  );
}
