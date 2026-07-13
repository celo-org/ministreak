"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "ms_onboarded";

/**
 * First-run onboarding gate. SSR-safe: starts closed and only reads localStorage
 * inside an effect. All storage access is wrapped so an unavailable localStorage
 * simply means the carousel doesn't show.
 */
export function useOnboarding(): {
  open: boolean;
  show: () => void;
  dismiss: () => void;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) == null) setOpen(true);
    } catch {
      /* localStorage unavailable — leave closed */
    }
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const show = useCallback(() => setOpen(true), []);

  return { open, show, dismiss };
}
