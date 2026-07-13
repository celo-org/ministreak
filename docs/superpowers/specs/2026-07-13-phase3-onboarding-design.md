# Phase 3 — Onboarding Carousel Design

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Origin:** MiniPay feedback #1 — explain the game to new users. The last piece of the
retention/UX work. Pure frontend, no backend, no wallet dependency, no contract.

---

## 1. Scope

A first-run onboarding carousel that explains MiniStreak to a brand-new MiniPay user. Keeps the
current editorial look (no restyle). Shows once (localStorage-gated), skippable, and re-openable
from the existing "How to play" card. Reflects the **currently-live** features (Score, XP/levels,
streak-freeze, loyalty).

## 2. Components

- **`OnboardingCarousel.tsx`** (presentational): props `open: boolean`, `onDismiss: () => void`.
  Full-screen overlay; 4 screens; dot indicators; Next/Skip; final CTA dismisses. Renders nothing
  when `open` is false.
- **`useOnboarding()`** hook: owns the localStorage first-run logic. Returns `{ open, show, dismiss }`.
  - On mount (client, `useEffect`), if `localStorage["ms_onboarded"]` is unset → `open = true`.
  - `dismiss()` → set `localStorage["ms_onboarded"] = "1"`, `open = false`.
  - `show()` → `open = true` (manual replay; does not clear the flag).
  - **SSR-safe:** starts `open = false`; the first-run check runs only in `useEffect` (no hydration
    mismatch, no `window` access during render).

## 3. Screens (approved copy)

Each screen: a glyph, a title, a short body. Editorial style, minimal.

1. **Welcome** — 🔥
   > **Welcome to MiniStreak**
   > A weekly streak game on Celo. Show up every day, keep your streak alive, and win real USDT.
2. **How to play** — 🎟️
   > **Play in 2 steps**
   > 1. Pay **0.10 USDT** to join this week's round.
   > 2. Make at least one transaction **every day** to grow your streak.
3. **How you win** — 🏆
   > **How you win**
   > Longest streaks take the pot. Ties break by **Score** (your daily activity — spamming doesn't
   > help), then unique people you paid. Top 3 split the pot **50 / 30 / 20**.
4. **Stay in it** — 🛡️
   > **Keep your edge**
   > Earn **XP** and level up as you play. Reach milestones to bank a **streak-freeze** — miss a
   > day without breaking your streak. Return each week for a **loyalty boost**.
   > CTA: **Get started** (dismisses)

## 4. Mechanics

- **Overlay:** fixed full-screen, above app content, with a dimmed backdrop; mobile-first.
- **Navigation:** a **Next** button advances; on the last screen it becomes **Get started** and
  calls `onDismiss`. **Skip** (top corner) on every screen calls `onDismiss`. **Dot indicators**
  show position. **Swipe** (touch left/right) advances/retreats — a lightweight touch handler;
  Next/dots remain the primary path so swipe is an enhancement, not required.
- **Dismiss** always routes through `onDismiss` (the hook sets the flag).

## 5. Re-open entry point

In the existing "How to play" card (`app/page.tsx`), add a small **"Replay intro"** link that
calls the hook's `show()`. No new surface elsewhere.

## 6. Degradation

- No JS / localStorage unavailable → the carousel simply doesn't show; the app is fully usable
  (onboarding is additive). No wallet or network dependency — it renders regardless of connection.

## 7. Testing

- `OnboardingCarousel`: renders nothing when `open=false`; shows screen 1 when open; **Next**
  advances to screen 2; **dots** reflect the index; **Skip** calls `onDismiss`; the last screen's
  **Get started** calls `onDismiss`.
- `useOnboarding`: first mount with no flag → `open` becomes true; `dismiss()` sets the flag and
  closes; a subsequent mount with the flag set → stays closed; `show()` re-opens without clearing
  the flag. (jsdom localStorage; `renderHook`.)
- Wiring: `page.tsx` renders the carousel and the "Replay intro" link invokes `show()`.

## 8. Out of scope

- Restyle / new visual system (keep editorial). Illustrations beyond simple glyphs. Per-screen
  animations beyond a simple transition. Analytics on onboarding completion (could be a later
  add). Editing the existing "How to play" rules copy.
