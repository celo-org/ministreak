"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useTodayStreak } from "@/hooks/useTodayStreak";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePreviousRoundRefund } from "@/hooks/usePreviousRoundRefund";
import StreakCard from "@/components/StreakCard";
import RoundTimer from "@/components/RoundTimer";
import EntryButton from "@/components/EntryButton";
import ClaimRefundCard from "@/components/ClaimRefundCard";
import ResolveRoundButton from "@/components/ResolveRoundButton";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
import LegalLinks from "@/components/Footer";
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

  const { data: todayData } = useTodayStreak(
    round?.roundId?.toString(),
    address
  );

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
          <img src="/Logo_Color.svg" alt="MiniStreak" className="h-[25px] w-auto" />
          <WalletBadge />
        </div>
        <p className="eyebrow text-forest">Weekly streak game</p>
      </header>

      {/* Hero — round pot */}
      {round && (
        <section className="rounded-2xl p-6 bg-paper-tint border border-rule">
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
        </section>
      )}

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
          todayDone={todayData?.todayDone ?? false}
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
              <>Pay <strong>0.10 USDT</strong> to enter each week’s round (Mon 00:00 — Sun 23:59 UTC).</>,
              <>Send <strong>any outgoing transaction</strong> every day to build your streak.</>,
              <>Ranking: longest streak, then tx count, then unique addresses.</>,
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
