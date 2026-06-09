"use client";

import { useState } from "react";
import { usePublicClient, useAccount, useConfig } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import { VAULT_ADDRESS, VAULT_ABI } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";

type Step = "idle" | "resolving" | "done" | "error";

export function useResolveRound() {
  const config = useConfig();
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolveRound(roundId: bigint) {
    if (!publicClient || !address || !isConnected) {
      setStep("error");
      setError("Wallet not connected.");
      return;
    }

    setStep("resolving");
    setError(null);
    setTxHash(null);

    try {
      const walletClient = await getWalletClient(config);

      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * BigInt(120)) / BigInt(100);

      const estGas = await publicClient.estimateContractGas({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "resolveRound",
        args: [roundId],
        account: address,
      });

      const tx = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "resolveRound",
        args: [roundId],
        chain: activeChain,
        account: address,
        gas: (estGas * BigInt(130)) / BigInt(100),
        gasPrice: gasPriceWithBuffer,
        type: "legacy" as const,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") {
        throw new Error("Resolve transaction reverted on-chain.");
      }

      setTxHash(tx);
      setStep("done");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Resolve failed");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }

  return { resolveRound, step, txHash, error, reset };
}
