"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePreviousRoundRefund } from "@/hooks/usePreviousRoundRefund";
import { useTodayActivity } from "@/hooks/useTodayActivity";
import StreakCard from "@/components/StreakCard";
import RoundTimer from "@/components/RoundTimer";
import EntryButton from "@/components/EntryButton";
import ClaimRefundCard from "@/components/ClaimRefundCard";
import ResolveRoundButton from "@/components/ResolveRoundButton";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
import LegalLinks from "@/components/Footer";
import { roundDayIndex } from "@/lib/roundDay";
import { useState } from "react";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const [howToOpen, setHowToOpen] = useState(false);

  const { data: round, isLoading: roundLoading, isError: roundError, refetch: refetchRound } =
    useCurrentRound();

  const { stats, isLoading: statsLoading } = usePlayerStats(
    round?.roundId,
    address
  );

  // "Done today" is derived on-chain: the player's last recorded streak day
  // equals the current round-day index. The vault (via the oracle) is the
  // source of truth, so this flips to true within a refetch of the cron
  // recording today's streak. roundDayIndex snaps near-midnight round starts to
  // UTC midnight, so "today" tracks the calendar day (and matches the scanner's
  // day-index exactly, since both use the same helper).
  const nowSec = Math.floor(Date.now() / 1000);
  const currentDayIndex = round ? roundDayIndex(round.startTime, nowSec) : -1;
  const todayDone =
    !!stats?.entered &&
    stats.lastValidDay !== 255 &&
    stats.lastValidDay === currentDayIndex;

  const { hasActivityToday } = useTodayActivity(address, round);
  const optimisticToday = hasActivityToday && !todayDone;

  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard(
    round?.roundId?.toString()
  );

  const { isAdmin } = useIsAdmin(address);

  const { info: refundInfo, refetch: refetchRefund } = usePreviousRoundRefund(
    round?.roundId,
    address
  );

  return (
    <main className="pt-10 space-y-6">
      {/* Masthead — logo + wallet on one line, tagline below */}
      <header className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Logo_Color.svg"
            alt="MiniStreak"
            width={136}
            height={25}
            className="h-[25px] w-auto"
          />
          <WalletBadge />
        </div>
        <p className="eyebrow text-forest">Weekly streak game</p>
      </header>

      {/* Hero — round pot. Always render the container with a stable min-height
          so the async on-chain read doesn't shift the layout below it (CLS). */}
      <section className="rounded-2xl p-6 bg-paper-tint border border-rule min-h-[172px]">
        {round ? (
          <>
            <p className="eyebrow">
              Round #{round.roundId.toString()} {round.isOpen ? "· Open" : "· Closed"}
            </p>
            <p className="display-xl num mt-1">
              <span className="text-ink">{round.potFormatted}</span>
              <span className="ml-2 font-sans font-medium text-2xl align-top text-ink-mute">
                USDT
              </span>
            </p>
            <p className="text-ink-mute text-sm mt-2">
              {round.playerCount.toString()}{" "}
              {Number(round.playerCount) === 1 ? "player" : "players"} in the pot
            </p>
          </>
        ) : (
          <div className="animate-pulse space-y-3" aria-hidden>
            <div className="h-3 w-24 rounded bg-paper-deep" />
            <div className="h-14 w-44 rounded bg-paper-deep" />
            <div className="h-3 w-32 rounded bg-paper-deep" />
          </div>
        )}
      </section>

      {/* Round timer */}
      <RoundTimer endTime={round?.endTime} />

      {/* Refund claim (previous round, only if claimable) */}
      {isConnected && refundInfo.claimable && refundInfo.roundId !== null && (
        <ClaimRefundCard
          roundId={refundInfo.roundId}
          onSuccess={refetchRefund}
        />
      )}

      {/* Streak card (if entered) */}
      {isConnected && stats?.entered && (
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayDone || hasActivityToday}
          optimistic={optimisticToday}
          isLoading={statsLoading}
        />
      )}

      {/* Entry CTA */}
      {isConnected ? (
        roundLoading || !round ? (
          roundError ? (
            <div className="card text-center space-y-2">
              <p className="text-coral font-semibold">Contract unreachable</p>
              <p className="text-ink-mute text-sm">
                Make sure you’re connected to Celo and the contract is deployed.
              </p>
            </div>
          ) : (
            <button className="btn-secondary cursor-wait" disabled>
              Connecting…
            </button>
          )
        ) : (
          <EntryButton
            roundId={round.roundId}
            isEntered={stats?.entered ?? false}
            isOpen={round.isOpen}
            onSuccess={refetchRound}
          />
        )
      ) : (
        <div className="card text-center space-y-3">
          <p className="text-ink-mute">Connect a wallet to enter this week.</p>
          <WalletBadge />
        </div>
      )}

      {/* Admin: resolve current round (visible only to KEEPER/ADMIN role holders) */}
      {isConnected && isAdmin && round && (
        <ResolveRoundButton
          roundId={round.roundId}
          onSuccess={refetchRound}
        />
      )}

      {/* Top 5 leaderboard */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="font-sans font-bold text-2xl tracking-tight">This week</h2>
          <span className="eyebrow">Top 5</span>
        </div>
        <Leaderboard
          entries={leaderboard?.entries ?? []}
          isLoading={lbLoading}
          showPrizes
          maxRows={5}
          highlightAddress={address}
        />
      </section>

      {/* How to play */}
      <section className="rounded-2xl p-5 bg-paper-tint border border-rule">
        <button
          onClick={() => setHowToOpen(!howToOpen)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="font-sans font-bold text-lg text-ink tracking-tight">
            How to play
          </span>
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
              <>Miss a day? <strong>You’re out</strong> — streak resets to zero.</>,
              <>Winners split the pot <strong>50 / 30 / 20</strong> (minus 5% fee).</>,
              <>Fewer than 3 players? All entry fees are refunded.</>,
            ].map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-sans font-bold text-forest num shrink-0 w-6">
                  0{i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Inline legal + support (replaces the global footer divider) */}
      <LegalLinks />
    </main>
  );
}
