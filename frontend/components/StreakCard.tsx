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
        <div className="h-20 bg-gray-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className={`card border-2 ${todayDone ? "border-celo-green" : "border-gray-700"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
            Current Streak
          </p>
          <div className="flex items-center gap-2">
            <span className="text-5xl font-black text-white">{streak}</span>
            <span className="text-3xl">
              {streak > 0 ? (streak >= 7 ? "🔥" : streak >= 3 ? "⚡" : "✨") : ""}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {streak === 1 ? "1 day" : `${streak} days`} in a row
          </p>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl ${
              todayDone
                ? "bg-celo-green/20 border-2 border-celo-green"
                : "bg-gray-800 border-2 border-gray-700"
            }`}
          >
            {todayDone ? "✓" : "✗"}
          </div>
          <p className={`text-xs font-medium ${todayDone ? "text-celo-green" : "text-red-400"}`}>
            {todayDone ? "Done today" : "Pending"}
          </p>
        </div>
      </div>

      {!todayDone && streak > 0 && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded-xl text-xs text-red-300">
          Send a tx today to keep your streak alive!
        </div>
      )}
    </div>
  );
}
