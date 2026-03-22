"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useTodayStreak } from "@/hooks/useTodayStreak";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import StreakCard from "@/components/StreakCard";
import RoundTimer from "@/components/RoundTimer";
import EntryButton from "@/components/EntryButton";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
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

  return (
    <main className="pt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-black text-white">
            MiniStreak
          </h1>
          <p className="text-xs text-gray-500">Weekly Streak Leaderboard</p>
        </div>
        <WalletBadge />
      </div>

      {/* Round Status Banner */}
      {round && (
        <div className="card bg-gradient-to-r from-celo-purple/30 to-gray-900 border-celo-purple/40">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Round #{round.roundId.toString()}</p>
              <p className="text-2xl font-black text-celo-gold">
                {round.potFormatted} USDT
              </p>
              <p className="text-xs text-gray-400">
                {round.playerCount.toString()} players in pot
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <span
                className={`badge text-sm py-1 px-3 ${
                  round.isOpen
                    ? "bg-celo-green/20 text-celo-green border border-celo-green/30"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
              >
                {round.isOpen ? "Open" : "Closed"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Round Timer */}
      <RoundTimer endTime={round?.endTime} />

      {/* Streak Card (only when connected and entered) */}
      {isConnected && stats?.entered && (
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayData?.todayDone ?? false}
          isLoading={statsLoading}
        />
      )}

      {/* Entry Button */}
      {isConnected ? (
        roundLoading ? (
          <button className="btn-secondary cursor-wait" disabled>
            Connecting to contract...
          </button>
        ) : roundError || !round ? (
          <div className="card text-center space-y-2">
            <p className="text-red-400 text-sm font-semibold">Contract unreachable</p>
            <p className="text-gray-500 text-xs">
              Make sure you&apos;re connected to Celo Sepolia testnet and the contract is deployed.
            </p>
          </div>
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
          <p className="text-gray-400 text-sm">
            Connect your wallet to enter the weekly streak competition
          </p>
          <WalletBadge />
        </div>
      )}

      {/* Mini Leaderboard */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest">
          Top 5 This Week
        </h2>
        <Leaderboard
          entries={leaderboard?.entries ?? []}
          isLoading={lbLoading}
          showPrizes
          maxRows={5}
          highlightAddress={address}
        />
      </div>

      {/* How it works */}
      <div className="card">
        <button
          onClick={() => setHowToOpen(!howToOpen)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="font-bold text-sm">How it works</span>
          <span className="text-gray-400">{howToOpen ? "▲" : "▼"}</span>
        </button>

        {howToOpen && (
          <div className="mt-3 space-y-2 text-sm text-gray-400">
            <p>
              1. Pay <strong className="text-white">0.5 USDT</strong> to enter each
              week&apos;s round (Mon 00:00 — Sun 23:59 UTC).
            </p>
            <p>
              2. Send <strong className="text-white">any outgoing transaction</strong>{" "}
              every day to build your streak.
            </p>
            <p>
              3. Ranking: <strong className="text-white">longest streak</strong>,
              then <strong className="text-white">tx count</strong>,
              then <strong className="text-white">unique addresses</strong>.
            </p>
            <p>
              4. Miss a day? <strong className="text-white">You&apos;re out</strong> — streak resets to zero.
            </p>
            <p>
              5. Winners split the pot:{" "}
              <strong className="text-white">50% / 30% / 20%</strong> (minus 5% fee).
            </p>
            <p>
              6. Fewer than 3 players? All entry fees are refunded.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
