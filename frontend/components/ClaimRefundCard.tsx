"use client";

import { useClaimRefund } from "@/hooks/useClaimRefund";

interface ClaimRefundCardProps {
  roundId: bigint;
  onSuccess?: () => void;
}

export default function ClaimRefundCard({
  roundId,
  onSuccess,
}: ClaimRefundCardProps) {
  const { claimRefund, step, error, reset } = useClaimRefund();

  if (step === "done") {
    return (
      <div className="card-gold text-center">
        <p className="font-sans font-bold text-xl text-ink tracking-tight">
          Refund claimed.
        </p>
        <p className="text-ink-mute text-sm mt-1">
          0.10 USDT returned to your wallet.
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-3">
        <div className="px-4 py-3 rounded-xl bg-coral-tint border border-coral/40 text-coral text-sm">
          {error || "Claim failed"}
        </div>
        <button onClick={reset} className="btn-secondary">
          Try again
        </button>
      </div>
    );
  }

  const isLoading = step === "claiming";

  return (
    <div className="card-gold space-y-3">
      <div className="flex items-center justify-between">
        <span className="pill-gold">Refund available</span>
        <span className="eyebrow">Round #{roundId.toString()}</span>
      </div>
      <p className="text-ink leading-relaxed">
        That round closed with fewer than 3 players. Claim your{" "}
        <strong>0.10 USDT</strong> entry fee back.
      </p>
      <button
        className="btn-primary"
        disabled={isLoading}
        onClick={() => {
          claimRefund(roundId).then(() => onSuccess?.());
        }}
      >
        {isLoading ? "Claiming…" : "Claim refund"}
      </button>
    </div>
  );
}
