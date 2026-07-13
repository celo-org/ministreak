"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "ms_onboarded";

function localDone(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false; // localStorage unavailable (e.g. some in-app webviews)
  }
}

function isMiniPay(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay)
  );
}

/**
 * Onboarding gate. The intro should show once to a genuinely new player and
 * never again.
 *
 * localStorage alone is unreliable inside MiniPay's webview (it can be wiped or
 * blocked), so once a wallet is connected the server flag (`/api/onboarded`) is
 * the source of truth — it survives across devices and storage resets. Before a
 * wallet connects we only show the intro in a plain browser; in MiniPay we wait
 * for the (auto-)connect so a returning player never sees a flash of the intro.
 */
export function useOnboarding(address?: string): {
  open: boolean;
  show: () => void;
  dismiss: () => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (localDone()) return; // already finished on this device

    if (address) {
      // Wallet connected: the server decides (survives a storage wipe).
      let cancelled = false;
      (async () => {
        try {
          const res = await fetch(`/api/onboarded?address=${address}`, {
            cache: "no-store",
          });
          const { onboarded } = (await res.json()) as { onboarded: boolean };
          if (!cancelled) setOpen(!onboarded);
        } catch {
          // Network miss: bias to not annoying a returning player.
          if (!cancelled) setOpen(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // No wallet yet. In MiniPay a connect is imminent — wait for the address
    // (this effect re-runs when it arrives) rather than flashing the intro.
    if (!isMiniPay()) setOpen(true);
  }, [address]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    if (address) {
      fetch("/api/onboarded", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      }).catch(() => {});
    }
    setOpen(false);
  }, [address]);

  const show = useCallback(() => setOpen(true), []);

  return { open, show, dismiss };
}
