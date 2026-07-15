"use client";

import { useState } from "react";
import { usePublicClient, useAccount, useConfig } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import { XP_ADDRESS, XP_ABI } from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";
import { BUILDER_SUFFIX } from "@/lib/builderCode";

type Step = "idle" | "claiming" | "done" | "error";

export function useClaimXp() {
  const config = useConfig();
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (!publicClient || !address || !isConnected) {
      setStep("error");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }
    let walletClient;
    try {
      walletClient = await getWalletClient(config);
    } catch {
      setStep("error");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }

    setStep("claiming");
    setError(null);
    setTxHash(null);

    try {
      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * BigInt(120)) / BigInt(100);

      const gas = await publicClient.estimateContractGas({
        address: XP_ADDRESS,
        abi: XP_ABI,
        functionName: "claimDaily",
        account: address,
      });

      const tx = await walletClient.writeContract({
        address: XP_ADDRESS,
        abi: XP_ABI,
        functionName: "claimDaily",
        chain: activeChain,
        account: address,
        gas: (gas * BigInt(130)) / BigInt(100),
        gasPrice: gasPriceWithBuffer,
        type: "legacy" as const,
        dataSuffix: BUILDER_SUFFIX,
      });

      await publicClient.waitForTransactionReceipt({ hash: tx });
      setTxHash(tx);
      setStep("done");
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Claim failed");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }

  return { claim, step, txHash, error, reset };
}
