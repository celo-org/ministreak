"use client";

import { useEnterRound } from "@/hooks/useEnterRound";

interface EntryButtonProps {
  roundId: bigint | undefined;
  isEntered: boolean;
  isOpen: boolean;
  onSuccess?: () => void;
}

export default function EntryButton({
  roundId,
  isEntered,
  isOpen,
  onSuccess,
}: EntryButtonProps) {
  const { enterRound, step, txHash, error, reset } = useEnterRound();

  if (isEntered) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 px-6 bg-celo-green/20 border border-celo-green rounded-2xl">
        <span className="text-celo-green text-lg">✓</span>
        <span className="text-celo-green font-bold">You&apos;re In This Week</span>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button className="btn-secondary cursor-not-allowed" disabled>
        Round Closed
      </button>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 py-3 bg-celo-green/20 border border-celo-green rounded-2xl">
          <span className="text-celo-green font-bold">Entered! Good luck!</span>
        </div>
        {txHash && (
          <p className="text-xs text-gray-500 text-center truncate">
            Tx: {txHash.slice(0, 20)}...
          </p>
        )}
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-2">
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-xl text-xs text-red-300">
          {error || "Transaction failed"}
        </div>
        <button onClick={reset} className="btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  const isLoading = step === "approving" || step === "entering";
  const label =
    step === "approving"
      ? "Approving USDT..."
      : step === "entering"
      ? "Entering Round..."
      : "Enter This Week — 0.5 USDT";

  return (
    <button
      className="btn-primary"
      disabled={isLoading || !roundId}
      onClick={() => {
        if (roundId) {
          enterRound(roundId).then(() => onSuccess?.());
        }
      }}
    >
      {isLoading && (
        <span className="inline-block animate-spin mr-2">⏳</span>
      )}
      {label}
    </button>
  );
}
