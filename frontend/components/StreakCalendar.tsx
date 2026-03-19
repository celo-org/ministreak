"use client";

interface DayEntry {
  dayIndex: number;
  txCount: number;
  newStreak: number;
  timestamp: number;
}

interface StreakCalendarProps {
  dailyStreaks: DayEntry[];
  isLoading?: boolean;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StreakCalendar({ dailyStreaks, isLoading }: StreakCalendarProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-20 bg-gray-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  // Current day index relative to today (to know which days are "past")
  const today = Math.floor(Date.now() / 1000);

  return (
    <div className="card">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">
        This Week
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map((label, i) => {
          const streak = dailyStreaks.find((d) => d.dayIndex === i);
          const isCompleted = !!streak;
          const isFuture = false; // subgraph only has past data

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={`w-full aspect-square rounded-xl flex items-center justify-center text-lg transition-colors ${
                  isCompleted
                    ? "bg-celo-green text-gray-950"
                    : "bg-gray-800 text-gray-600"
                }`}
              >
                {isCompleted ? "✓" : "·"}
              </div>
              <span className="text-xs text-gray-500">{label}</span>
              {isCompleted && (
                <span className="text-xs text-celo-green font-medium">
                  {streak.txCount} txs
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
