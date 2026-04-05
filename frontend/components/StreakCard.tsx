"use client";

interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  isLoading?: boolean;
}

export default function StreakCard({
  streak,
  todayDone,
  isLoading,
}: StreakCardProps) {
  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-20 bg-arcade-card rounded-sm" />
      </div>
    );
  }

  return (
    <div className={`card border-2 ${todayDone ? "border-celo-green" : "border-arcade-dim"}`}>
      <div className="text-center">
        <p className="font-pixel text-celo-green mb-1" style={{ fontSize: "7px" }}>
          CURRENT STREAK
        </p>
        <span className="font-pixel text-4xl text-white">{streak}</span>
        <p className="font-pixel text-arcade-muted mt-1" style={{ fontSize: "7px" }}>
          {streak === 1 ? "1 DAY" : `${streak} DAYS`} IN A ROW
        </p>
      </div>

      {!todayDone && streak > 0 && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded-sm font-pixel text-red-300" style={{ fontSize: "7px" }}>
          SEND A TX TODAY TO KEEP YOUR STREAK!
        </div>
      )}
    </div>
  );
}
