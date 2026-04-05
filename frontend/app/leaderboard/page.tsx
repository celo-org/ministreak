"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import Leaderboard from "@/components/Leaderboard";

export default function LeaderboardPage() {
  const { address } = useAccount();
  const { data: round } = useCurrentRound();
  const displayRoundId = round?.roundId?.toString() || undefined;

  const { data: leaderboard, isLoading } = useLeaderboard(displayRoundId);

  return (
    <main className="pt-6 space-y-4">
      <h1 className="font-pixel text-lg text-white">LEADERBOARD</h1>

      {/* Round indicator */}
      {round && (
        <p className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
          ROUND #{round.roundId.toString()}
        </p>
      )}

      {/* Stats */}
      {leaderboard?.round && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center">
            <p className="font-pixel text-arcade-muted" style={{ fontSize: "5px" }}>
              POT
            </p>
            <p className="font-pixel text-celo-gold glow-gold mt-1" style={{ fontSize: "10px" }}>
              {leaderboard.round.pot} USDT
            </p>
          </div>
          <div className="card text-center">
            <p className="font-pixel text-arcade-muted" style={{ fontSize: "5px" }}>
              PLAYERS
            </p>
            <p className="font-pixel text-white mt-1" style={{ fontSize: "10px" }}>
              {leaderboard.round.playerCount}
            </p>
          </div>
          <div className="card text-center">
            <p className="font-pixel text-arcade-muted" style={{ fontSize: "5px" }}>
              STATUS
            </p>
            <p className="font-pixel text-white mt-1 uppercase" style={{ fontSize: "10px" }}>
              {leaderboard.round.status}
            </p>
          </div>
        </div>
      )}

      {/* Full leaderboard */}
      <Leaderboard
        entries={leaderboard?.entries ?? []}
        isLoading={isLoading}
        showPrizes
        highlightAddress={address}
      />

      {/* Tiebreaker note */}
      {(leaderboard?.entries.some((e, i, arr) =>
        i > 0 && arr[i - 1].streak === e.streak
      )) && (
        <div className="card font-pixel text-arcade-muted text-center" style={{ fontSize: "6px" }}>
          RANKED BY STREAK, THEN TX COUNT, THEN UNIQUE ADDRESSES
        </div>
      )}

      <p className="font-pixel text-arcade-dim text-center pb-2" style={{ fontSize: "5px" }}>
        UPDATES EVERY 30 SECONDS
      </p>
    </main>
  );
}
