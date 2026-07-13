# UI Revamp Design

**Date:** 2026-07-13
**Status:** Approved direction (visual mockup signed off), pending implementation plan
**Branch:** `ui-revamp`
**Visual reference (source of truth for pixels):** `docs/superpowers/specs/2026-07-13-ui-revamp-mockup.html`
**Origin:** MiniPay feedback — "make the UI nicer, MiniQuiz/Duolingo feel." Learn from MiniQuiz,
don't copy; keep MiniStreak's own identity. Add a 3rd tab (profile).

---

## 1. Direction

**MiniQuiz's warmth + chunk, MiniStreak's soul.** Keep the existing **warm cream + forest-green +
navy-ink** palette (it already overlaps MiniQuiz's) and the **hand-sketch icon language**; layer on
the playful chunkiness: rounded display type, chunky rounded cards, colored icon-chips with an
accent underline, pill toggles, level badges, a podium. Single warm-cream world by choice.

## 2. Hard rules

- **No emoji anywhere in the app.** Every icon is a brand-consistent **monochrome, single-weight,
  filled SVG** in the sketch language of the existing `public/home.svg` / `public/leaderboard.svg`.
  (Current emoji to remove: `StreakCard` 🛡, `OnboardingCarousel` 🔥🎟🏆🛡, `Leaderboard` 🥇🥈🥉.)
- **Truthful copy.** XP is earned by a **daily transaction** (same trigger as the streak) — never
  "open the app." Numbers reflect the real model (`xpForDay = 10 + (streak−1)×5`, level curve,
  50/30/20 prizes).
- **"Welcome back" only for returning players.** Show it only when the connected player has played
  before (`useProfile().profile.xp > 0`); a brand-new connected user gets just their name (no
  eyebrow). Not connected → no greeting.
- **Reuse the existing design system**; extend `globals.css` tokens + `tailwind.config`, don't fork.

## 3. Design tokens (extend, don't replace)

Existing (keep): `--paper #FAF6EC`, `--paper-tint`, `--paper-deep`, `--ink #1B1A17`, `--ink-mute`,
`--ink-faint`, `--rule`, `--forest #1B6B3F`, `--forest-deep`, `--forest-tint`.

Add **candy accent tokens** (used ONLY as small icon-chip backgrounds + card bottom-accent —
forest stays the one bold hero color):
`--amber #E39A2E`/`--amber-tint`, `--sky #3E93CE`/`--sky-tint`, `--berry #CF5C86`/`--berry-tint`,
`--gold #D9A82E`/`--gold-tint`. Semantic mapping: **amber = streak**, **sky = score**,
**berry = freeze**, **gold = rank/prize**, **forest = XP / primary / active**.

## 4. Typography

- **Display (headings + all numbers):** **Fredoka** (rounded, Google-hosted) via `next/font/google`,
  mapped to `font-display` / `--font-fredoka`. Replaces Fraunces in the display role.
- **Body:** keep **DM Sans** (`font-sans`).
- **Mono:** keep JetBrains for truncated addresses.
- Numbers use `tabular-nums`. Uppercase micro-labels get letter-spacing.

## 5. Primitives (new reusable classes / components)

Per the mockup: `card` (chunky rounded, soft shadow), `stat` (card + colored icon-chip + big number
+ uppercase label + accent underline), `chip` (rounded-square colored icon holder), `pill` /
`pill-stat` (rounded icon+number), `toggle` (segmented, forest-filled active), `btn-primary` (chunky,
forest with a solid drop-shadow "3d" edge), `badge`/`lvl` (level pill), `avatar` (colored circle +
monogram, optional level pill), `hero` (forest gradient card), `podium`, `bar` (XP progress),
`lbrow` (leaderboard row). Author as Tailwind `@layer components` in `globals.css` mirroring the
mockup exactly.

## 6. Brand-sketch icon set

New monochrome filled SVGs (as React components in `frontend/components/icons/` and/or `public/`),
`fill="currentColor"` so they recolor via the chip. Matching the sketch weight of the existing
assets (first pass in the mockup; **refine the hand-drawn wobble during build, verifying visually**):

- **streak** (flame), **score** (4-point spark), **freeze** (shield with mark), **rank/trophy**,
  **daily** (spark, reuse score), **crown** (podium), **medal** (rank 1 star), and
- **me** — one figure derived from `public/leaderboard.svg` (strip its 3 figures to 1), for the new
  tab + used elsewhere. Keep existing **home**/**board** (leaderboard.svg) icons.

## 7. Navigation → 3 tabs

`BottomNav`: **Home · Board (middle) · Me (right)**. Board keeps `leaderboard.svg`; **Me** uses the
single-figure derived icon. Active tab = forest, icon + label (rounded font). (Currently 2 tabs:
Home | Board.)

## 8. Surfaces

### 8a. `/me` — Profile page (NEW route)
Connected-player profile (see mockup "Me"): avatar (monogram from address) + `LVL n` pill,
pseudonym + truncated address, **2×2 stat cards** — **Streak** (value, best), **Score** (this
week's pts), **Freezes** (tokens held), **Rank** (#n of players) — and the **XP progress card**
("Level n → n+1 · x/y XP", bar, "Earn XP every day you transact"). Data: `useProfile`
(xp/level/xpIntoLevel/xpForNextLevel/freezeTokens), `usePlayerStats` (streak/score), `useLeaderboard`
(rank), `pseudonymFor`/`shortAddress`. Not connected → a connect prompt. No KV/onchain change.

### 8b. Home restyle
Masthead (logo + menu placeholder/wallet), header row (avatar + greeting [conditional "Welcome
back"] + a streak pill-stat), **forest-gradient pot hero** (round #, pot USDT, players, countdown,
"Enter this week · 0.10 USDT" button), **Daily XP card** (7-day dot row with earned XP +
today's `+n XP` + "Send a transaction daily to earn XP"), **streak card** (restyled, with freeze
count), **Top 5** preview (`lbrow`), keep How-to-play + Replay-intro. Preserve all existing logic
(entry, refund, resolve, optimistic today, etc.).

### 8c. Board restyle (`/leaderboard`)
`Board` heading + trophy icon, **podium hero** (gradient, crown, elevated winner, top-3 avatars),
**This week / Last week** toggle (visual; wire if data allows, else current-round only),
`lbrow` list (medal/rank · avatar monogram · name+@addr·Lv · score · estimated prize), highlight the
connected player's row. Restyle the shared `Leaderboard` component (replace 🥇🥈🥉).

### 8d. StreakCard restyle
Chunky card, streak number + flame icon-chip, optimistic "Today's in" pill, **freeze count with the
freeze SVG** (replace 🛡), level/XP where shown.

### 8e. Onboarding icons
Slide 1 → **logo** (`Logo_Color.svg`); slides 2/3/4 → brand-sketch icons (how-to-play / how-you-win
/ stay-in-it). Remove the 4 emojis; keep the copy + carousel behavior from Phase 3.

## 9. Verification

Because this is visual, correctness = it looks right, not only tests pass:
- Keep/adjust existing component tests (Leaderboard, StreakCard, Onboarding) as markup changes;
  update assertions that referenced emoji.
- **Controller-led visual QA:** run the app (`/run`) and/or render screens to screenshot; iterate on
  icons, spacing, gradients until they match the mockup. Icon hand-drawn refinement is done against
  the render, not blind.
- `npm run type-check` + full suite green before each commit.

## 10. Out of scope

- No backend/KV/contract change. No new data. Mascot illustration (we have none — use a faint logo
  watermark on the hero for personality instead). "Last week" leaderboard data if not already
  available (toggle can be visual/deferred). Dark theme (single cream world by choice).
