/**
 * pseudonym.ts
 * Deterministic, readable aliases for 0x addresses.
 *
 * MiniPay requires that raw 0x addresses NOT be used as the primary
 * user identifier. This module derives a stable adjective-noun-hash
 * pseudonym from any address, e.g. 0xabc... -> "BraveTiger-7F2A".
 *
 * The hash suffix prevents collisions across the curated word list
 * and keeps the alias unique enough for leaderboard use.
 */

const ADJECTIVES = [
  "Brave", "Swift", "Bold", "Cosmic", "Pixel", "Quantum", "Neon", "Atomic",
  "Crystal", "Lucky", "Rapid", "Silent", "Solar", "Stellar", "Turbo", "Wild",
  "Ace", "Alpha", "Blaze", "Cyber", "Dawn", "Echo", "Frost", "Glide",
  "Hyper", "Iron", "Jet", "Kinetic", "Laser", "Mystic", "Nova", "Onyx",
] as const;

const NOUNS = [
  "Tiger", "Falcon", "Comet", "Phoenix", "Dragon", "Wolf", "Hawk", "Lion",
  "Panda", "Shark", "Eagle", "Cobra", "Lynx", "Otter", "Raven", "Viper",
  "Bear", "Cheetah", "Ghost", "Knight", "Mage", "Ninja", "Ranger", "Samurai",
  "Titan", "Voyager", "Wizard", "Yeti", "Zebra", "Pirate", "Pilot", "Pulse",
] as const;

/**
 * Stable 32-bit hash of a hex address. Strips 0x prefix, lowercases,
 * folds bytes via xor + rotation. Pure JS, no dependencies.
 */
function hashAddress(addr: string): number {
  const clean = addr.toLowerCase().replace(/^0x/, "");
  let h = 0x811c9dc5; // FNV-1a offset basis (32-bit)
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // FNV-1a prime
  }
  return h >>> 0;
}

/**
 * Build a deterministic pseudonym from an address.
 * Same address -> same pseudonym, every time.
 */
export function pseudonymFor(address: string | undefined | null): string {
  if (!address) return "Anonymous";
  const h = hashAddress(address);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[(h >>> 8) % NOUNS.length];
  const suffix = ((h >>> 16) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return `${adj}${noun}-${suffix}`;
}

/**
 * Truncated 0x address, intended ONLY as a secondary hint
 * displayed in small, low-contrast text alongside the pseudonym.
 */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Two-letter monogram for avatars, from a pseudonym's capital letters
 * (e.g. "SwiftOtter-7F2A" -> "SO"). Falls back to the first two letters.
 */
export function monogram(name: string): string {
  const caps = name.replace(/-.*/, "").match(/[A-Z]/g);
  if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  return name.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "?";
}
