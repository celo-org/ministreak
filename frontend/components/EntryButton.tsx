"use client";

import { useEnterRound } from "@/hooks/useEnterRound";
import { useEntryEligibility } from "@/hooks/useEntryEligibility";
import { MINIPAY_DEPOSIT_DEEPLINK } from "@/lib/contracts";

interface EntryButtonProps {
  roundId: bigint | undefined;
  isEntered: boolean;
  isOpen: boolean;
  onSuccess?: () => void;
  variant?: "card" | "hero";
}

export default function EntryButton({
  roundId,
  isEntered,
  isOpen,
  onSuccess,
  variant = "card",
}: EntryButtonProps) {
  const { enterRound, step, error, reset } = useEnterRound();
  const eligibility = useEntryEligibility();
  const hero = variant === "hero";

  if (isEntered) {
    return hero ? (
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 text-white font-display font-bold py-3">
        <span className="h-1.5 w-1.5 rounded-full bg-white" />
        You’re in this week
      </div>
    ) : (
      <div className="card-accent text-center">
        <span className="pill-forest">
          <span className="h-1.5 w-1.5 rounded-full bg-forest" />
          You’re in this week
        </span>
      </div>
    );
  }

  if (!isOpen) {
    return hero ? (
      <div className="text-center rounded-2xl bg-white/15 text-white/80 font-display font-bold py-3">
        Round closed
      </div>
    ) : (
      <button className="btn-secondary cursor-not-allowed" disabled>
        Round closed
      </button>
    );
  }

  if (step === "done") {
    return (
      <div className="card-accent text-center">
        <p className="font-sans font-bold text-2xl text-forest-deep tracking-tight">
          Entered! Good luck.
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-3">
        <div className="px-4 py-3 rounded-xl bg-coral-tint border border-coral/40 text-coral text-sm">
          {error || "Transaction failed"}
        </div>
        <button onClick={reset} className="btn-secondary">
          Try again
        </button>
      </div>
    );
  }

  // Insufficient USDT — MiniPay rule §2 + §6
  if (eligibility.status === "swap_needed") {
    return (
      <div className="space-y-2">
        <div className="rounded-xl px-4 py-2.5 bg-gold-tint border border-gold-bright/50 text-sm">
          <span className="font-semibold text-gold">USDT needed.</span>
          <span className="text-ink-mute ml-1">
            Swap to USDT in MiniPay or add directly.
          </span>
        </div>
        <a
          href={MINIPAY_DEPOSIT_DEEPLINK}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          Get USDT
        </a>
      </div>
    );
  }

  if (eligibility.status === "deposit_needed") {
    return (
      <div className="space-y-2">
        <div className="rounded-xl px-4 py-2.5 bg-gold-tint border border-gold-bright/50 text-sm">
          <span className="font-semibold text-gold">Low balance.</span>
          <span className="text-ink-mute ml-1">
            You need 0.10 USDT to enter this week.
          </span>
        </div>
        <a
          href={MINIPAY_DEPOSIT_DEEPLINK}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          Deposit USDT
        </a>
      </div>
    );
  }

  const isLoading = step === "approving" || step === "entering";
  const label =
    step === "approving"
      ? "Approving…"
      : step === "entering"
      ? "Entering…"
      : "Enter this week — 0.10 USDT";

  return (
    <button
      className={
        hero
          ? "block w-full text-center font-display font-bold py-3.5 rounded-2xl bg-white text-forest-deep shadow-[0_4px_0_rgba(0,0,0,0.14)] transition-transform active:translate-y-[2px] disabled:opacity-60"
          : "btn-primary"
      }
      disabled={isLoading || !roundId || eligibility.status === "loading"}
      onClick={() => {
        if (roundId) {
          enterRound(roundId).then(() => onSuccess?.());
        }
      }}
    >
      {label}
    </button>
  );
}
