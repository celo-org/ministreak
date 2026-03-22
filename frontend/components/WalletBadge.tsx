"use client";

import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window {
    ethereum?: any;
  }
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WalletBadge() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // In MiniPay, wallet is implicit — hide connect/disconnect UI
  const isMiniPay =
    typeof window !== "undefined" && window.ethereum?.isMiniPay === true;

  // Auto-connect in MiniPay — wallet is always available
  useEffect(() => {
    if (isMiniPay && !isConnected) {
      connect({ connector: injected() });
    }
  }, [isMiniPay, isConnected, connect]);

  if (isMiniPay && isConnected) {
    return (
      <div className="badge bg-celo-green/20 text-celo-green border border-celo-green/30">
        {address ? truncate(address) : "Connected"}
      </div>
    );
  }

  if (!isConnected) {
    if (isMiniPay) return null; // MiniPay should auto-connect

    return (
      <button
        onClick={() => connect({ connector: injected() })}
        className="badge bg-gray-800 text-gray-300 border border-gray-700 hover:border-celo-green transition-colors py-1.5 px-3"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <button
      onClick={() => disconnect()}
      className="badge bg-gray-800 text-gray-300 border border-gray-700"
    >
      {address ? truncate(address) : "Connected"}
    </button>
  );
}
