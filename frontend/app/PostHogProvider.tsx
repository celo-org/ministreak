"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { initAnalytics, capture, capturePageview } from "@/lib/analytics";

/**
 * Initializes PostHog once, tracks manual pageviews on route change, and emits
 * a single `wallet_connected` event when a wallet first connects (no address).
 * Must render inside WagmiProvider (uses useAccount).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <WalletConnectTracker />
      {children}
    </>
  );
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    capturePageview(url);
  }, [pathname, searchParams]);

  return null;
}

function WalletConnectTracker() {
  const { isConnected, connector } = useAccount();
  const fired = useRef(false);

  useEffect(() => {
    if (isConnected && !fired.current) {
      fired.current = true;
      capture("wallet_connected", {
        // metadata only — never the address
        connector: connector?.name ?? "unknown",
        is_minipay:
          typeof window !== "undefined" &&
          (window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay ===
            true,
      });
    }
    if (!isConnected) fired.current = false;
  }, [isConnected, connector]);

  return null;
}
