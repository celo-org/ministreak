"use client";

import { useState } from "react";
import { usePublicClient, useAccount, useConfig } from "wagmi";
import { getWalletClient } from "@wagmi/core";
import {
  VAULT_ADDRESS,
  VAULT_ABI,
  USDT_ADDRESS,
  ERC20_ABI,
  ENTRY_FEE,
} from "@/lib/contracts";
import { activeChain } from "@/lib/wagmi";
import { BUILDER_SUFFIX } from "@/lib/builderCode";

type Step = "idle" | "approving" | "entering" | "done" | "error";

export function useEnterRound() {
  const config = useConfig();
  const publicClient = usePublicClient();
  const { address, isConnected } = useAccount();

  const [step, setStep] = useState<Step>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enterRound(roundId: bigint) {
    if (!publicClient || !address || !isConnected) {
      setStep("error");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }

    // Fetch wallet client on-demand. On MiniPay auto-connect, `useWalletClient()`
    // can still be undefined for a tick after `address` is populated — getting
    // it here waits for the connector instead of failing the tap.
    let walletClient;
    try {
      walletClient = await getWalletClient(config);
    } catch {
      setStep("error");
      setError("Wallet not connected. Please connect your wallet first.");
      return;
    }

    setStep("idle");
    setError(null);
    setTxHash(null);

    try {
      // Fetch current gas price for Celo legacy tx mode
      const gasPrice = await publicClient.getGasPrice();
      // Add 20% buffer to avoid "gas fee cap below minimum base fee"
      const gasPriceWithBuffer = (gasPrice * BigInt(120)) / BigInt(100);

      // Step 1: Check allowance
      const allowance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, VAULT_ADDRESS],
      });

      // Step 2: Approve if needed
      if ((allowance as bigint) < ENTRY_FEE) {
        setStep("approving");

        // Estimate gas for approve
        const approveGas = await publicClient.estimateContractGas({
          address: USDT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [VAULT_ADDRESS, ENTRY_FEE],
          account: address,
        });

        const approveTx = await walletClient.writeContract({
          address: USDT_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [VAULT_ADDRESS, ENTRY_FEE],
          chain: activeChain,
          account: address,
          gas: (approveGas * BigInt(150)) / BigInt(100),
          gasPrice: gasPriceWithBuffer,
          type: "legacy" as const,
          dataSuffix: BUILDER_SUFFIX,
        });

        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveTx,
        });
        if (approveReceipt.status !== "success") {
          throw new Error(
            "USDT approval failed on-chain. Please try again — if it keeps failing, top up CELO for gas."
          );
        }
      }

      // Step 3: Enter the round
      setStep("entering");

      // Estimate gas for enterRound
      const enterGas = await publicClient.estimateContractGas({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "enterRound",
        args: [roundId],
        account: address,
      });

      const enterTx = await walletClient.writeContract({
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: "enterRound",
        args: [roundId],
        chain: activeChain,
        account: address,
        gas: (enterGas * BigInt(130)) / BigInt(100), // 30% buffer for reentrancy guard
        gasPrice: gasPriceWithBuffer,
        type: "legacy" as const,
        dataSuffix: BUILDER_SUFFIX,
      });

      await publicClient.waitForTransactionReceipt({ hash: enterTx });

      setTxHash(enterTx);
      setStep("done");
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  function reset() {
    setStep("idle");
    setError(null);
    setTxHash(null);
  }

  return { enterRound, step, txHash, error, reset };
}
