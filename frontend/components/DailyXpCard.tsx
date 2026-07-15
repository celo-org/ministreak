"use client";

import { useEffect } from "react";
import { useReadContract } from "wagmi";
import { useClaimXp } from "@/hooks/useClaimXp";
import { useXp } from "@/hooks/useXp";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";
import { ScoreIcon } from "@/components/icons";

const DEFAULT_DAILY_XP = 10;

interface DailyXpCardProps {
  address?: string;
  currentDayIndex: number;
}

export default function DailyXpCard({ address, currentDayIndex }: DailyXpCardProps) {
  const { canClaim, canClaimKnown, refetch } = useXp(address);
  const { claim, step, error, reset } = useClaimXp();

  const { data: dailyXpRaw } = useReadContract({
    address: XP_ADDRESS,
    abi: XP_ABI,
    functionName: "dailyXp",
  });
  const dailyXp = dailyXpRaw !== undefined ? Number(dailyXpRaw as bigint) : DEFAULT_DAILY_XP;

  // Optimistically flip to "claimed" the moment the tx confirms, then
  // reconcile with the chain so canClaim/xp reflect the real state.
  useEffect(() => {
    if (step === "done") refetch();
  }, [step, refetch]);

  const claiming = step === "claiming";
  const claimed = step === "done" || (canClaimKnown && !canClaim);
  const hasError = step === "error";
  const checking = !hasError && !claiming && step !== "done" && !canClaimKnown;

  return (
    <div className="card !p-4 relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="chip chip-forest w-[30px] h-[30px]"><ScoreIcon /></div>
          <b className="font-display text-sm font-semibold">Daily XP</b>
        </div>
        <span className="font-display text-[15px] font-semibold text-forest num">
          +{dailyXp} XP today
        </span>
      </div>

      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const past = currentDayIndex >= 0 && d < currentDayIndex;
          const today = d === currentDayIndex;
          const filled = past || (today && claimed);
          return (
            <div key={d} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full max-w-[30px] aspect-square rounded-full grid place-items-center font-display font-semibold text-[10px] num ${
                  filled
                    ? "bg-forest text-white"
                    : today
                    ? "bg-amber text-white ring-[3px] ring-amber-tint"
                    : "bg-paper-deep text-ink-faint"
                }`}
              >
                {d + 1}
              </div>
            </div>
          );
        })}
      </div>

      {hasError ? (
        <div className="mt-3 space-y-2">
          <div className="px-3 py-2 rounded-xl bg-coral-tint border border-coral/40 text-coral text-[12.5px]">
            {error || "Claim failed"}
          </div>
          <button type="button" onClick={reset} className="btn-secondary">
            Try again
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => claim()}
          disabled={claimed || claiming || checking}
          className="btn-primary mt-3 gap-1.5 disabled:opacity-100 disabled:bg-forest-tint disabled:text-forest disabled:shadow-none"
        >
          {checking ? (
            "Checking…"
          ) : claiming ? (
            "Claiming…"
          ) : claimed ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="flex-shrink-0"
              >
                <path
                  d="M3 8.5L6.5 12L13 4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Claimed +{dailyXp} today
            </>
          ) : (
            `Claim today's XP · +${dailyXp}`
          )}
        </button>
      )}

      <div className="text-[10.5px] text-ink-mute mt-2.5">Claim your XP each day.</div>
      <span className="absolute left-4 right-4 bottom-0 h-[3px] rounded-full bg-forest" />
    </div>
  );
}
