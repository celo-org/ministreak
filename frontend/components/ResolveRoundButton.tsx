"use client";

import { useResolveRound } from "@/hooks/useResolveRound";

interface ResolveRoundButtonProps {
  roundId: bigint;
  onSuccess?: () => void;
}

export default function ResolveRoundButton({
  roundId,
  onSuccess,
}: ResolveRoundButtonProps) {
  const { resolveRound, step, error, reset } = useResolveRound();

  if (step === "done") {
    return (
      <div className="card text-center">
        <span className="pill-forest">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          Round resolved
        </span>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-3">
        <div className="px-4 py-3 rounded-xl bg-coral-tint border border-coral/40 text-coral text-sm">
          {error || "Resolve failed"}
        </div>
        <button onClick={reset} className="btn-secondary">
          Try again
        </button>
      </div>
    );
  }

  const isLoading = step === "resolving";

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Admin</span>
        <span className="pill-muted">Round #{roundId.toString()}</span>
      </div>
      <button
        className="btn-secondary"
        disabled={isLoading}
        onClick={() => {
          resolveRound(roundId).then(() => onSuccess?.());
        }}
      >
        {isLoading ? "Resolving…" : "Resolve round"}
      </button>
    </div>
  );
}
