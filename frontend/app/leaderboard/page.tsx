"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { fetchPastRounds } from "@/lib/graphql";
import Leaderboard from "@/components/Leaderboard";
import { useQuery } from "@tanstack/react-query";

export default function LeaderboardPage() {
  const { address } = useAccount();
  const { data: round } = useCurrentRound();
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  // Fetch past rounds for the dropdown
  const { data: pastRounds } = useQuery({
    queryKey: ["pastRounds"],
    queryFn: () => fetchPastRounds(20, 0),
    staleTime: 60_000,
  });

  const displayRoundId =
    selectedRoundId || round?.roundId?.toString() || undefined;

  const { data: leaderboard, isLoading } = useLeaderboard(displayRoundId);

  const roundOptions = [
    ...(round ? [{ id: round.roundId.toString(), label: `Round #${round.roundId} (Current)` }] : []),
    ...(pastRounds?.rounds.map((r) => ({
      id: r.roundId,
      label: `Round #${r.roundId} — ${r.status === "Resolved" ? "Resolved" : "Refunded"}`,
    })) ?? []),
  ];

  return (
    <main className="pt-6 space-y-4">
      <h1 className="text-2xl font-black">Leaderboard</h1>

      {/* Round selector */}
      <select
        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-200"
        value={selectedRoundId || ""}
        onChange={(e) => setSelectedRoundId(e.target.value || null)}
      >
        <option value="">Current Round</option>
        {roundOptions.slice(1).map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Stats */}
      {leaderboard?.round && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center">
            <p className="text-xs text-gray-500">Pot</p>
            <p className="text-lg font-black text-celo-gold">
              {leaderboard.round.pot} USDT
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Players</p>
            <p className="text-lg font-black text-white">
              {leaderboard.round.playerCount}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Status</p>
            <p className="text-lg font-black text-white capitalize">
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
        <div className="card text-xs text-gray-400 text-center">
          Ranked by streak, then tx count, then unique addresses.
        </div>
      )}

      <p className="text-xs text-gray-600 text-center pb-2">
        Updates every 30 seconds via The Graph
      </p>
    </main>
  );
}
