/**
 * analytics.ts
 * Privacy-locked PostHog wrapper (Celo team project, US cloud).
 *
 * Posture (strict, for a wallet app):
 *  - Manual events only — autocapture OFF (never scrapes on-screen text /
 *    wallet addresses), pageviews captured manually.
 *  - Session replay OFF.
 *  - Users stay anonymous — we NEVER identify() with a wallet address, and
 *    never pass an address in event properties. MiniPay forbids treating a
 *    0x… address as identity.
 *  - Respects Do-Not-Track.
 *
 * No-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is unset (preview / local),
 * so nothing breaks and no events are sent off a misconfigured build.
 */

import posthog from "posthog-js";

let initialized = false;

export function initAnalytics(): void {
  if (typeof window === "undefined" || initialized) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // unconfigured -> stay silent

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false, // done manually (App Router)
    capture_pageleave: true,
    disable_session_recording: true,
    person_profiles: "identified_only", // we never identify -> fully anonymous
    respect_dnt: true,
  });
  initialized = true;
}

export function capture(
  event: string,
  properties?: Record<string, unknown>
): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function capturePageview(url: string): void {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: url });
}
