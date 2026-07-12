"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import Leaderboard from "@/components/Leaderboard";

export default function LeaderboardPage() {
  const { address } = useAccount();
  const { data: round } = useCurrentRound();
  const displayRoundId = round?.roundId?.toString() || undefined;

  const { data: leaderboard, isLoading, updatedAt } = useLeaderboard(displayRoundId);

  const stats = leaderboard?.round;

  return (
    <main className="pt-8 space-y-6">
      <header>
        <p className="eyebrow text-forest">Live standings</p>
        <div className="flex items-baseline justify-between mt-1 gap-3">
          <h1 className="font-sans font-bold text-4xl text-ink leading-none tracking-tight">
            Leaderboard
          </h1>
          {round && (
            <span className="pill-muted">
              Round #{round.roundId.toString()}
            </span>
          )}
        </div>
      </header>

      {/* Round stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card-gold !p-4 text-center">
            <p className="eyebrow text-gold !text-[10px]">Pot</p>
            <p className="font-sans font-bold text-xl num text-ink mt-1">
              {stats.pot}
            </p>
            <p className="text-[10px] uppercase tracking-cap text-ink-mute mt-0.5">USDT</p>
          </div>
          <div className="card !p-4 text-center">
            <p className="eyebrow !text-[10px]">Players</p>
            <p className="font-sans font-bold text-xl num text-ink mt-1">
              {stats.playerCount}
            </p>
          </div>
          <div className="card !p-4 text-center">
            <p className="eyebrow !text-[10px]">Status</p>
            <p className="font-sans font-bold text-xl text-forest mt-1 capitalize">
              {stats.status}
            </p>
          </div>
        </div>
      )}

      {/* Full board */}
      <Leaderboard
        entries={leaderboard?.entries ?? []}
        isLoading={isLoading}
        showPrizes
        highlightAddress={address}
        updatedAt={updatedAt}
      />

      {/* Tiebreaker note */}
      {leaderboard?.entries.some((e, i, arr) =>
        i > 0 && arr[i - 1].streak === e.streak
      ) && (
        <p className="text-center text-sm text-ink-mute">
          Ties broken by tx count, then unique addresses.
        </p>
      )}

      <p className="text-center text-xs text-ink-faint">
        Updates every 30 seconds.
      </p>
    </main>
  );
}
