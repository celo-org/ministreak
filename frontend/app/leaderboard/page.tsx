"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
import { CrownIcon } from "@/components/icons";
import { pseudonymFor, monogram, avatarColor } from "@/lib/pseudonym";

function PodiumPlayer({ entry, me, win }: { entry: LeaderboardEntry; me: boolean; win?: boolean }) {
  const name = pseudonymFor(entry.address);
  return (
    <div className="flex flex-col items-center gap-1.5 text-white">
      <div
        className={`avatar ${win ? "w-[62px] h-[62px] text-lg -translate-y-1.5" : "w-[50px] h-[50px] text-[15px]"}`}
        style={{ background: avatarColor(entry.address) }}
      >
        {monogram(name)}
      </div>
      <div className="font-display font-semibold text-xs max-w-[80px] truncate">
        {me ? "You" : name.split("-")[0]}
      </div>
      <div className="text-[10.5px] opacity-90 num">{entry.txCount} pts</div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { address } = useAccount();
  const { data: round } = useCurrentRound();
  const [tab, setTab] = useState<"this" | "last">("this");

  const thisRoundId = round?.roundId?.toString() || undefined;
  const lastRoundId =
    round && round.roundId > BigInt(1)
      ? (round.roundId - BigInt(1)).toString()
      : undefined;

  const { data: thisBoard, isLoading: thisLoading, updatedAt } =
    useLeaderboard(thisRoundId);
  const { data: lastBoard, isLoading: lastLoading } = useLeaderboard(lastRoundId);

  const showLast = tab === "last";
  const entries = (showLast ? lastBoard?.entries : thisBoard?.entries) ?? [];
  const isLoading = showLast ? lastLoading : thisLoading;
  const shownRoundId = showLast ? lastRoundId : thisRoundId;

  const isMe = (a: string) => !!address && a.toLowerCase() === address.toLowerCase();
  const [first, second, third] = entries;

  return (
    <main className="pt-9 pb-4 space-y-5">
      <header className="flex items-center justify-between gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo_Color.svg" alt="MiniStreak" width={136} height={25} className="h-[25px] w-auto" />
        <WalletBadge />
      </header>

      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-semibold text-3xl tracking-tight">Leaderboard</h1>
        {shownRoundId && <span className="pill-muted num">Round #{shownRoundId}</span>}
      </div>

      {/* week toggle */}
      <div className="toggle">
        <button data-on={!showLast} onClick={() => setTab("this")}>This week</button>
        <button data-on={showLast} onClick={() => setTab("last")}>Last week</button>
      </div>

      {/* podium — top 3 */}
      {first && (
        <div
          className="relative rounded-[20px] p-4 pt-7"
          style={{
            background: "linear-gradient(120deg,#E39A2E,#CF5C86)",
            boxShadow: "0 14px 28px -18px rgba(207,92,134,0.75)",
          }}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white">
            <CrownIcon width={22} height={15} />
          </div>
          <div className="flex items-end justify-center gap-4">
            {second && <PodiumPlayer entry={second} me={isMe(second.address)} />}
            <PodiumPlayer entry={first} me={isMe(first.address)} win />
            {third && <PodiumPlayer entry={third} me={isMe(third.address)} />}
          </div>
        </div>
      )}

      {/* full board */}
      {showLast && !lastRoundId ? (
        <div className="card text-center text-ink-mute">No previous round yet.</div>
      ) : (
        <Leaderboard
          entries={entries}
          isLoading={isLoading}
          showPrizes
          highlightAddress={address}
          updatedAt={showLast ? undefined : updatedAt}
        />
      )}
    </main>
  );
}
