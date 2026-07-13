/**
 * onboardStore.ts — Vercel KV persistence for a per-wallet "has seen onboarding"
 * flag. MiniPay's in-app webview can wipe or block localStorage, so the browser
 * flag alone is unreliable; this survives across sessions keyed to the address.
 * Reads never throw — on a KV error we treat the player as already onboarded so
 * an infra hiccup never spams a returning user with the intro.
 */
import { kv } from "@vercel/kv";

const KEY = (address: string) => `onboarded:${address.toLowerCase()}`;

export async function isOnboarded(address: string): Promise<boolean> {
  try {
    return (await kv.get<number>(KEY(address))) != null;
  } catch (e) {
    console.warn(`isOnboarded read failed for ${address}:`, (e as Error).message);
    return true; // fail-safe: don't re-show onboarding on a read error
  }
}

export async function markOnboarded(address: string): Promise<void> {
  await kv.set(KEY(address), 1);
}
