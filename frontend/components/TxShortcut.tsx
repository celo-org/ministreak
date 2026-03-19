"use client";

import { useState } from "react";
import { useWalletClient, usePublicClient, useAccount } from "wagmi";
import { parseEther } from "viem";

export default function TxShortcut({ onSuccess }: { onSuccess?: () => void }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  async function sendQuickTx() {
    if (!walletClient || !publicClient || !address) return;
    setStep("sending");
    setError("");

    try {
      // Send a minimal CELO transfer to self — any outgoing tx counts
      const hash = await walletClient.sendTransaction({
        to: address,
        value: parseEther("0.001"),
        gasPrice: BigInt(5_000_000_000),
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setStep("done");
      onSuccess?.();
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  if (step === "done") {
    return (
      <div className="card border-celo-green/40 border">
        <div className="flex items-center gap-2 text-celo-green font-bold mb-1">
          <span>✓</span> Quick tx sent!
        </div>
        <p className="text-xs text-gray-400">
          Your transaction has been recorded. The oracle will update your streak shortly.
        </p>
        {txHash && (
          <p className="text-xs text-gray-600 mt-1 truncate">Tx: {txHash}</p>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-bold text-sm">Quick Streak Tx</h3>

      <p className="text-xs text-gray-400">
        Any outgoing transaction counts toward your daily streak. This sends a
        tiny amount of CELO (0.001) to yourself as a quick way to keep your
        streak alive.
      </p>

      {step === "error" && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <button
        className="btn-primary"
        onClick={sendQuickTx}
        disabled={step === "sending"}
      >
        {step === "sending" ? "Sending..." : "Send Quick Tx (0.001 CELO)"}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Sends 0.001 CELO to yourself — any outgoing tx counts
      </p>
    </div>
  );
}
