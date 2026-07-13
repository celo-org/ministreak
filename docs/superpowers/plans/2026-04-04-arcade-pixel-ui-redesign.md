# Arcade Pixel UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire MiniStreak frontend to an Arcade Pixel aesthetic — pixelated fonts, sharp corners, neon green glow, pixel box-shadows, SVG pixel icons, no emoji.

**Architecture:** Pure visual restyling across 13 existing files. Foundation layer (tailwind config, globals.css, layout.tsx) must be done first, then all components can be modified independently. Zero logic changes.

**Tech Stack:** Next.js 14, Tailwind CSS, Google Fonts (Press Start 2P), inline SVG

---

## File Map

| File | Role | Task |
|------|------|------|
| `frontend/tailwind.config.ts` | Color tokens, font-pixel family | Task 1 |
| `frontend/app/globals.css` | Base component classes, utility classes | Task 1 |
| `frontend/app/layout.tsx` | Google Fonts link, body bg | Task 1 |
| `frontend/components/BottomNav.tsx` | Pixel SVG icons, green border nav | Task 2 |
| `frontend/app/page.tsx` | Home page pixel restyling | Task 3 |
| `frontend/components/RoundTimer.tsx` | Pixel timer boxes | Task 4 |
| `frontend/components/StreakCard.tsx` | Pixel streak, no emoji | Task 4 |
| `frontend/components/StreakCalendar.tsx` | Pixel day squares | Task 4 |
| `frontend/components/EntryButton.tsx` | Pixel button, blinking loader | Task 5 |
| `frontend/components/WalletBadge.tsx` | Pixel badge, sharp corners | Task 5 |
| `frontend/components/TxShortcut.tsx` | Pixel heading/button | Task 5 |
| `frontend/components/Leaderboard.tsx` | Text ranks, pixel font | Task 6 |
| `frontend/app/leaderboard/page.tsx` | Leaderboard page restyling | Task 6 |

---

### Task 1: Foundation — Tailwind Config, Global CSS, Layout

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Update tailwind.config.ts with arcade color tokens and pixel font**

Replace the entire contents of `frontend/tailwind.config.ts` with:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        celo: {
          green: "#35D07F",
          gold: "#FBCC5C",
        },
        arcade: {
          bg: "#0d1117",
          card: "#111827",
          muted: "#4B5563",
          dim: "#374151",
          timer: "#1a1a2e",
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Rewrite globals.css with arcade component classes**

Replace the entire contents of `frontend/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --celo-green: #35D07F;
    --celo-gold: #FBCC5C;
    --arcade-bg: #0d1117;
    --arcade-card: #111827;
    --shadow-green: rgba(53, 208, 127, 0.2);
    --shadow-btn: #1a6b40;
  }

  body {
    @apply antialiased;
  }

  html {
    scroll-behavior: smooth;
    -webkit-text-size-adjust: 100%;
  }
}

@layer components {
  .btn-primary {
    @apply bg-celo-green text-arcade-bg font-pixel py-3 px-6 rounded-sm
           active:scale-95 transition-transform disabled:opacity-50
           disabled:cursor-not-allowed w-full text-center text-xs;
    box-shadow: 4px 4px 0 var(--shadow-btn);
  }

  .btn-primary:disabled {
    box-shadow: none;
  }

  .btn-secondary {
    @apply bg-arcade-card text-gray-100 font-pixel py-3 px-6 rounded-sm
           border border-arcade-dim active:scale-95 transition-transform
           disabled:opacity-50 w-full text-center text-xs;
  }

  .card {
    @apply bg-arcade-card rounded-sm p-4 border border-celo-green;
    box-shadow: 4px 4px 0 var(--shadow-green);
  }

  .badge {
    @apply inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-pixel;
  }

  .pixel-shadow {
    box-shadow: 4px 4px 0 var(--shadow-green);
  }

  .glow-green {
    text-shadow: 0 0 8px rgba(53, 208, 127, 0.5);
  }

  .glow-gold {
    text-shadow: 0 0 6px rgba(251, 204, 92, 0.4);
  }
}
```

- [ ] **Step 3: Update layout.tsx with Google Fonts and arcade background**

Replace the entire contents of `frontend/app/layout.tsx` with:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "MiniStreak — Weekly Streak Leaderboard",
  description:
    "Compete in weekly on-chain transaction streak competitions on Celo. Build your streak, climb the leaderboard, win USDT.",
  metadataBase: new URL("https://frontend-roan-phi-84.vercel.app"),
  openGraph: {
    title: "MiniStreak",
    description: "Weekly transaction streak leaderboard on Celo",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-arcade-bg text-gray-100 min-h-screen">
        <Providers>
          <div className="max-w-md mx-auto px-4 pb-24">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the foundation builds**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -20
```
Expected: Build succeeds. No errors about missing colors or font families.

- [ ] **Step 5: Commit foundation**

```bash
cd frontend && git add tailwind.config.ts app/globals.css app/layout.tsx && git commit -m "style: arcade pixel foundation — tailwind tokens, global CSS, Google Fonts"
```

---

### Task 2: Bottom Navigation — Pixel SVG Icons

**Files:**
- Modify: `frontend/components/BottomNav.tsx`

- [ ] **Step 1: Replace BottomNav with pixel SVG icons and arcade styling**

Replace the entire contents of `frontend/components/BottomNav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function PixelHome({ active }: { active: boolean }) {
  const fill = active ? "#35D07F" : "#4B5563";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      shapeRendering="crispEdges"
    >
      {/* Roof */}
      <rect x="7" y="1" width="2" height="2" fill={fill} />
      <rect x="5" y="3" width="2" height="2" fill={fill} />
      <rect x="9" y="3" width="2" height="2" fill={fill} />
      <rect x="3" y="5" width="2" height="2" fill={fill} />
      <rect x="11" y="5" width="2" height="2" fill={fill} />
      {/* Walls */}
      <rect x="3" y="7" width="2" height="6" fill={fill} />
      <rect x="11" y="7" width="2" height="6" fill={fill} />
      <rect x="5" y="11" width="2" height="2" fill={fill} />
      <rect x="9" y="11" width="2" height="2" fill={fill} />
      {/* Door */}
      <rect x="7" y="9" width="2" height="4" fill={fill} />
      {/* Floor */}
      <rect x="3" y="13" width="10" height="2" fill={fill} />
    </svg>
  );
}

function PixelBoard({ active }: { active: boolean }) {
  const fill = active ? "#35D07F" : "#4B5563";
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      shapeRendering="crispEdges"
    >
      {/* Person 1 head */}
      <rect x="2" y="2" width="4" height="4" fill={fill} />
      {/* Person 1 body */}
      <rect x="3" y="6" width="2" height="4" fill={fill} />
      {/* Person 1 arms */}
      <rect x="1" y="7" width="2" height="2" fill={fill} />
      <rect x="5" y="7" width="2" height="2" fill={fill} />
      {/* Person 1 legs */}
      <rect x="2" y="10" width="2" height="2" fill={fill} />
      <rect x="4" y="10" width="2" height="2" fill={fill} />
      {/* Person 2 head */}
      <rect x="10" y="2" width="4" height="4" fill={fill} />
      {/* Person 2 body */}
      <rect x="11" y="6" width="2" height="4" fill={fill} />
      {/* Person 2 arms */}
      <rect x="9" y="7" width="2" height="2" fill={fill} />
      <rect x="13" y="7" width="2" height="2" fill={fill} />
      {/* Person 2 legs */}
      <rect x="10" y="10" width="2" height="2" fill={fill} />
      <rect x="12" y="10" width="2" height="2" fill={fill} />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/", label: "HOME", Icon: PixelHome },
  { href: "/leaderboard", label: "BOARD", Icon: PixelBoard },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-arcade-bg border-t border-celo-green z-50">
      <div className="max-w-md mx-auto flex">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                isActive ? "text-celo-green" : "text-arcade-muted"
              }`}
            >
              <Icon active={isActive} />
              <span className="font-pixel" style={{ fontSize: "7px" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add components/BottomNav.tsx && git commit -m "style: arcade pixel bottom nav with SVG pixel icons"
```

---

### Task 3: Home Page (page.tsx)

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Restyle page.tsx with arcade pixel classes**

Replace the entire contents of `frontend/app/page.tsx` with:

```tsx
"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { usePlayerStats } from "@/hooks/usePlayerStats";
import { useTodayStreak } from "@/hooks/useTodayStreak";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import StreakCard from "@/components/StreakCard";
import RoundTimer from "@/components/RoundTimer";
import EntryButton from "@/components/EntryButton";
import Leaderboard from "@/components/Leaderboard";
import WalletBadge from "@/components/WalletBadge";
import { useState } from "react";

export default function HomePage() {
  const { address, isConnected } = useAccount();
  const [howToOpen, setHowToOpen] = useState(false);

  const { data: round, isLoading: roundLoading, isError: roundError, refetch: refetchRound } =
    useCurrentRound();

  const { stats, isLoading: statsLoading } = usePlayerStats(
    round?.roundId,
    address
  );

  const { data: todayData } = useTodayStreak(
    round?.roundId?.toString(),
    address
  );

  const { data: leaderboard, isLoading: lbLoading } = useLeaderboard(
    round?.roundId?.toString()
  );

  return (
    <main className="pt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-pixel text-lg text-celo-green glow-green">
            MINISTREAK
          </h1>
          <p className="font-pixel text-arcade-muted" style={{ fontSize: "6px" }}>
            WEEKLY STREAK GAME
          </p>
        </div>
        <WalletBadge />
      </div>

      {/* Round Status Banner */}
      {round && (
        <div
          className="rounded-sm p-4 border-2 border-celo-green pixel-shadow"
          style={{ background: "linear-gradient(135deg, #1a2332, #0d1117)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
                ROUND #{round.roundId.toString()}
              </p>
              <p className="font-pixel text-2xl text-celo-gold glow-gold mt-1">
                {round.potFormatted} USDT
              </p>
              <p className="font-pixel text-arcade-muted mt-1" style={{ fontSize: "7px" }}>
                {round.playerCount.toString()} PLAYERS IN POT
              </p>
            </div>
            <div className="text-right">
              <span
                className={`font-pixel rounded-sm py-1 px-3 border ${
                  round.isOpen
                    ? "bg-celo-green/20 text-celo-green border-celo-green/30"
                    : "bg-arcade-card text-arcade-muted border-arcade-dim"
                }`}
                style={{ fontSize: "7px" }}
              >
                {round.isOpen ? "OPEN" : "CLOSED"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Round Timer */}
      <RoundTimer endTime={round?.endTime} />

      {/* Streak Card (only when connected and entered) */}
      {isConnected && stats?.entered && (
        <StreakCard
          streak={Number(stats.streak)}
          todayDone={todayData?.todayDone ?? false}
          isLoading={statsLoading}
        />
      )}

      {/* Entry Button */}
      {isConnected ? (
        roundLoading || !round ? (
          roundError ? (
            <div className="card text-center space-y-2">
              <p className="text-red-400 font-pixel" style={{ fontSize: "8px" }}>
                CONTRACT UNREACHABLE
              </p>
              <p className="text-arcade-muted text-xs">
                Make sure you&apos;re connected to Celo and the contract is deployed.
              </p>
            </div>
          ) : (
            <button className="btn-secondary cursor-wait" disabled>
              <span className="font-pixel" style={{ fontSize: "8px" }}>
                CONNECTING...
              </span>
            </button>
          )
        ) : (
          <EntryButton
            roundId={round.roundId}
            isEntered={stats?.entered ?? false}
            isOpen={round.isOpen}
            onSuccess={refetchRound}
          />
        )
      ) : (
        <div className="card text-center space-y-3">
          <p className="text-arcade-muted font-pixel" style={{ fontSize: "7px" }}>
            CONNECT WALLET TO ENTER
          </p>
          <WalletBadge />
        </div>
      )}

      {/* Mini Leaderboard */}
      <div className="space-y-2">
        <h2 className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
          TOP 5 THIS WEEK
        </h2>
        <Leaderboard
          entries={leaderboard?.entries ?? []}
          isLoading={lbLoading}
          showPrizes
          maxRows={5}
          highlightAddress={address}
        />
      </div>

      {/* How it works */}
      <div className="card">
        <button
          onClick={() => setHowToOpen(!howToOpen)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
            HOW TO PLAY
          </span>
          <span className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
            {howToOpen ? "<<" : ">>"}
          </span>
        </button>

        {howToOpen && (
          <div className="mt-3 space-y-2 text-sm text-arcade-muted">
            <p>
              <span className="font-pixel text-celo-green" style={{ fontSize: "7px" }}>01. </span>
              Pay <strong className="text-white">0.1 USDT</strong> to enter each
              week&apos;s round (Mon 00:00 — Sun 23:59 UTC).
            </p>
            <p>
              <span className="font-pixel text-celo-green" style={{ fontSize: "7px" }}>02. </span>
              Send <strong className="text-white">any outgoing transaction</strong>{" "}
              every day to build your streak.
            </p>
            <p>
              <span className="font-pixel text-celo-green" style={{ fontSize: "7px" }}>03. </span>
              Ranking: <strong className="text-white">longest streak</strong>,
              then <strong className="text-white">tx count</strong>,
              then <strong className="text-white">unique addresses</strong>.
            </p>
            <p>
              <span className="font-pixel text-celo-green" style={{ fontSize: "7px" }}>04. </span>
              Miss a day? <strong className="text-white">You&apos;re out</strong> — streak resets to zero.
            </p>
            <p>
              <span className="font-pixel text-celo-green" style={{ fontSize: "7px" }}>05. </span>
              Winners split the pot:{" "}
              <strong className="text-white">50% / 30% / 20%</strong> (minus 5% fee).
            </p>
            <p>
              <span className="font-pixel text-celo-green" style={{ fontSize: "7px" }}>06. </span>
              Fewer than 3 players? All entry fees are refunded.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add app/page.tsx && git commit -m "style: arcade pixel home page — pixel fonts, green borders, glow effects"
```

---

### Task 4: Streak Components — RoundTimer, StreakCard, StreakCalendar

**Files:**
- Modify: `frontend/components/RoundTimer.tsx`
- Modify: `frontend/components/StreakCard.tsx`
- Modify: `frontend/components/StreakCalendar.tsx`

- [ ] **Step 1: Restyle RoundTimer with pixel timer boxes**

Replace the entire contents of `frontend/components/RoundTimer.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";

interface RoundTimerProps {
  endTime: bigint | undefined;
}

function formatDuration(seconds: number): {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return {
    days: String(d).padStart(2, "0"),
    hours: String(h).padStart(2, "0"),
    minutes: String(m).padStart(2, "0"),
    seconds: String(s).padStart(2, "0"),
  };
}

export default function RoundTimer({ endTime }: RoundTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!endTime) return;

    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecondsLeft(Math.max(0, Number(endTime) - now));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  const { days, hours, minutes, seconds } = formatDuration(secondsLeft);

  if (!endTime) {
    return <div className="h-16 bg-arcade-card rounded-sm animate-pulse" />;
  }

  if (secondsLeft === 0) {
    return (
      <div className="card text-center">
        <p className="text-arcade-muted font-pixel" style={{ fontSize: "8px" }}>
          ROUND ENDED — AWAITING RESOLUTION
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="font-pixel text-celo-green text-center mb-2" style={{ fontSize: "7px" }}>
        ROUND ENDS IN
      </p>
      <div className="flex justify-center gap-3">
        {[
          { label: "DAYS", value: days },
          { label: "HRS", value: hours },
          { label: "MIN", value: minutes },
          { label: "SEC", value: seconds },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex flex-col items-center bg-arcade-timer border border-celo-green rounded-sm px-2 py-1"
            style={{ minWidth: "52px" }}
          >
            <span className="font-pixel text-xl text-white tabular-nums">
              {value}
            </span>
            <span className="font-pixel text-celo-green" style={{ fontSize: "5px" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Restyle StreakCard with pixel font and checkbox**

Replace the entire contents of `frontend/components/StreakCard.tsx` with:

```tsx
"use client";

interface StreakCardProps {
  streak: number;
  todayDone: boolean;
  isLoading?: boolean;
}

export default function StreakCard({
  streak,
  todayDone,
  isLoading,
}: StreakCardProps) {
  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="h-20 bg-arcade-card rounded-sm" />
      </div>
    );
  }

  return (
    <div className={`card border-2 ${todayDone ? "border-celo-green" : "border-arcade-dim"}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-pixel text-celo-green mb-1" style={{ fontSize: "7px" }}>
            CURRENT STREAK
          </p>
          <span className="font-pixel text-4xl text-white">{streak}</span>
          <p className="font-pixel text-arcade-muted mt-1" style={{ fontSize: "7px" }}>
            {streak === 1 ? "1 DAY" : `${streak} DAYS`} IN A ROW
          </p>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div
            className={`w-10 h-10 rounded-sm flex items-center justify-center font-pixel text-lg ${
              todayDone
                ? "bg-celo-green/15 border-2 border-celo-green text-celo-green"
                : "bg-arcade-card border-2 border-arcade-dim text-arcade-dim"
            }`}
          >
            {todayDone ? "x" : ""}
          </div>
          <p className={`font-pixel ${todayDone ? "text-celo-green" : "text-red-400"}`} style={{ fontSize: "6px" }}>
            {todayDone ? "DONE TODAY" : "PENDING"}
          </p>
        </div>
      </div>

      {!todayDone && streak > 0 && (
        <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded-sm font-pixel text-red-300" style={{ fontSize: "7px" }}>
          SEND A TX TODAY TO KEEP YOUR STREAK!
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Restyle StreakCalendar with pixel day squares**

Replace the entire contents of `frontend/components/StreakCalendar.tsx` with:

```tsx
"use client";

interface DayEntry {
  dayIndex: number;
  txCount: number;
  newStreak: number;
  timestamp: number;
}

interface StreakCalendarProps {
  dailyStreaks: DayEntry[];
  isLoading?: boolean;
}

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function StreakCalendar({ dailyStreaks, isLoading }: StreakCalendarProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-20 bg-arcade-card rounded-sm animate-pulse" />
      </div>
    );
  }

  return (
    <div className="card">
      <p className="font-pixel text-celo-green mb-3" style={{ fontSize: "7px" }}>
        THIS WEEK
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map((label, i) => {
          const streak = dailyStreaks.find((d) => d.dayIndex === i);
          const isCompleted = !!streak;

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={`w-full aspect-square rounded-sm flex items-center justify-center font-pixel transition-colors ${
                  isCompleted
                    ? "bg-celo-green text-arcade-bg"
                    : "bg-arcade-card border border-arcade-dim text-arcade-dim"
                }`}
                style={{ fontSize: "10px" }}
              >
                {isCompleted ? "x" : ""}
              </div>
              <span className="font-pixel text-arcade-dim" style={{ fontSize: "4px" }}>
                {label}
              </span>
              {isCompleted && (
                <span className="font-pixel text-celo-green" style={{ fontSize: "4px" }}>
                  {streak.txCount}TX
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add components/RoundTimer.tsx components/StreakCard.tsx components/StreakCalendar.tsx && git commit -m "style: arcade pixel streak components — timer boxes, streak card, calendar"
```

---

### Task 5: Action Components — EntryButton, WalletBadge, TxShortcut

**Files:**
- Modify: `frontend/components/EntryButton.tsx`
- Modify: `frontend/components/WalletBadge.tsx`
- Modify: `frontend/components/TxShortcut.tsx`

- [ ] **Step 1: Restyle EntryButton with pixel font and blinking loader**

Replace the entire contents of `frontend/components/EntryButton.tsx` with:

```tsx
"use client";

import { useEnterRound } from "@/hooks/useEnterRound";

interface EntryButtonProps {
  roundId: bigint | undefined;
  isEntered: boolean;
  isOpen: boolean;
  onSuccess?: () => void;
}

export default function EntryButton({
  roundId,
  isEntered,
  isOpen,
  onSuccess,
}: EntryButtonProps) {
  const { enterRound, step, txHash, error, reset } = useEnterRound();

  if (isEntered) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 px-6 bg-celo-green/20 border border-celo-green rounded-sm">
        <span className="font-pixel text-celo-green" style={{ fontSize: "9px" }}>
          [x] YOU&apos;RE IN THIS WEEK
        </span>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button className="btn-secondary cursor-not-allowed" disabled>
        ROUND CLOSED
      </button>
    );
  }

  if (step === "done") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2 py-3 bg-celo-green/20 border border-celo-green rounded-sm">
          <span className="font-pixel text-celo-green" style={{ fontSize: "9px" }}>
            ENTERED! GOOD LUCK!
          </span>
        </div>
        {txHash && (
          <p className="text-xs text-arcade-muted text-center truncate">
            Tx: {txHash.slice(0, 20)}...
          </p>
        )}
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-2">
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-sm text-xs text-red-300">
          {error || "Transaction failed"}
        </div>
        <button onClick={reset} className="btn-secondary">
          TRY AGAIN
        </button>
      </div>
    );
  }

  const isLoading = step === "approving" || step === "entering";
  const label =
    step === "approving"
      ? "APPROVING..."
      : step === "entering"
      ? "ENTERING..."
      : "ENTER - 0.1 USDT";

  return (
    <button
      className="btn-primary"
      disabled={isLoading || !roundId}
      onClick={() => {
        if (roundId) {
          enterRound(roundId).then(() => onSuccess?.());
        }
      }}
    >
      {isLoading && (
        <span className="animate-pulse mr-1">...</span>
      )}
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Restyle WalletBadge with pixel font and sharp corners**

Replace the entire contents of `frontend/components/WalletBadge.tsx` with:

```tsx
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

  const isMiniPay =
    typeof window !== "undefined" && window.ethereum?.isMiniPay === true;

  useEffect(() => {
    if (isMiniPay && !isConnected) {
      connect({ connector: injected() });
    }
  }, [isMiniPay, isConnected, connect]);

  if (isMiniPay && isConnected) {
    return (
      <div className="badge bg-celo-green/20 text-celo-green border border-celo-green/30" style={{ fontSize: "6px" }}>
        {address ? truncate(address) : "CONNECTED"}
      </div>
    );
  }

  if (!isConnected) {
    if (isMiniPay) return null;

    return (
      <button
        onClick={() => connect({ connector: injected() })}
        className="badge bg-arcade-card text-gray-300 border border-arcade-dim hover:border-celo-green transition-colors py-1.5 px-3"
        style={{ fontSize: "6px" }}
      >
        CONNECT WALLET
      </button>
    );
  }

  return (
    <button
      onClick={() => disconnect()}
      className="badge bg-arcade-card text-gray-300 border border-arcade-dim"
      style={{ fontSize: "6px" }}
    >
      {address ? truncate(address) : "CONNECTED"}
    </button>
  );
}
```

- [ ] **Step 3: Restyle TxShortcut with pixel font**

Replace the entire contents of `frontend/components/TxShortcut.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useWalletClient, usePublicClient, useAccount } from "wagmi";
import { parseEther } from "viem";
import { CHARITY_ADDRESS } from "@/lib/contracts";

export default function TxShortcut({ onSuccess }: { onSuccess?: () => void }) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  async function sendQuickTx() {
    if (!walletClient || !publicClient || !address) return;
    setStep("sending");
    setError("");

    try {
      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * BigInt(120)) / BigInt(100);

      const hash = await walletClient.sendTransaction({
        to: CHARITY_ADDRESS,
        value: parseEther("0.001"),
        gasPrice: gasPriceWithBuffer,
        type: "legacy" as const,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setStep("done");
      onSuccess?.();
    } catch (err: unknown) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  if (step === "done") {
    return (
      <div className="card border-celo-green/40 border">
        <p className="font-pixel text-celo-green mb-1" style={{ fontSize: "8px" }}>
          [x] TX SENT!
        </p>
        <p className="text-xs text-arcade-muted">
          Your transaction has been recorded. The oracle will update your streak shortly.
        </p>
        {txHash && (
          <p className="text-xs text-arcade-dim mt-1 truncate">Tx: {txHash}</p>
        )}
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
        QUICK STREAK TX
      </h3>

      <p className="text-xs text-arcade-muted">
        Any outgoing transaction (not self-send) counts toward your daily streak.
        This sends a tiny amount of CELO (0.001) as a quick way to keep your streak alive.
      </p>

      {step === "error" && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <button
        className="btn-primary"
        onClick={sendQuickTx}
        disabled={step === "sending"}
      >
        {step === "sending" ? "SENDING..." : "SEND QUICK TX (0.001 CELO)"}
      </button>

      <p className="font-pixel text-arcade-dim text-center" style={{ fontSize: "5px" }}>
        SENDS 0.001 CELO — ANY OUTGOING TX COUNTS
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add components/EntryButton.tsx components/WalletBadge.tsx components/TxShortcut.tsx && git commit -m "style: arcade pixel action components — entry button, wallet badge, tx shortcut"
```

---

### Task 6: Leaderboard Component and Page

**Files:**
- Modify: `frontend/components/Leaderboard.tsx`
- Modify: `frontend/app/leaderboard/page.tsx`

- [ ] **Step 1: Restyle Leaderboard with text ranks and pixel font**

Replace the entire contents of `frontend/components/Leaderboard.tsx` with:

```tsx
"use client";

import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  isLoading?: boolean;
  showPrizes?: boolean;
  maxRows?: number;
  highlightAddress?: string;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function rankLabel(rank: number): { text: string; isTop3: boolean } {
  return { text: `#${rank}`, isTop3: rank <= 3 };
}

export default function Leaderboard({
  entries,
  isLoading,
  showPrizes = true,
  maxRows,
  highlightAddress,
}: LeaderboardProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-arcade-card rounded-sm animate-pulse" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="card text-center py-8">
        <p className="font-pixel text-arcade-muted" style={{ fontSize: "8px" }}>
          NO PLAYERS YET
        </p>
      </div>
    );
  }

  const displayedEntries = maxRows ? entries.slice(0, maxRows) : entries;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-12 font-pixel text-arcade-muted px-3 pb-1" style={{ fontSize: "5px" }}>
        <span className="col-span-1">#</span>
        <span className="col-span-4">WALLET</span>
        <span className="col-span-2 text-center">STREAK</span>
        <span className="col-span-1 text-center">TXS</span>
        <span className="col-span-2 text-center">UNIQ</span>
        {showPrizes && <span className="col-span-2 text-right">PRIZE</span>}
      </div>

      {displayedEntries.map((entry) => {
        const isMe =
          highlightAddress &&
          entry.address.toLowerCase() === highlightAddress.toLowerCase();
        const prevEntry = entries[entries.indexOf(entry) - 1];
        const isTied =
          prevEntry &&
          prevEntry.streak === entry.streak &&
          prevEntry.txCount === entry.txCount &&
          prevEntry.uniqueToCount === entry.uniqueToCount;
        const { text: rankText, isTop3 } = rankLabel(entry.rank);

        return (
          <div
            key={entry.address}
            className={`grid grid-cols-12 items-center py-3 px-3 rounded-sm border transition-colors ${
              isMe
                ? "bg-celo-green/10 border-celo-green/40"
                : "bg-arcade-card border-arcade-dim"
            }`}
          >
            <span
              className={`col-span-1 font-pixel ${
                isTop3 ? "text-celo-gold" : "text-arcade-muted"
              }`}
              style={{ fontSize: "9px" }}
            >
              {rankText}
            </span>

            <div className="col-span-4">
              <p className={`text-xs font-mono ${isMe ? "text-celo-green font-bold" : "text-gray-200"}`}>
                {truncateAddress(entry.address)}
                {isMe && (
                  <span className="font-pixel text-celo-green ml-1" style={{ fontSize: "5px" }}>
                    YOU
                  </span>
                )}
              </p>
            </div>

            <div className="col-span-2 text-center">
              <span className="font-pixel text-celo-green" style={{ fontSize: "9px" }}>
                {entry.streak}
              </span>
              {isTied && (
                <p className="font-pixel text-celo-gold" style={{ fontSize: "5px" }}>
                  TIED
                </p>
              )}
            </div>

            <div className="col-span-1 text-center">
              <span className="text-xs text-arcade-muted">{entry.txCount}</span>
            </div>

            <div className="col-span-2 text-center">
              <span className="text-xs text-arcade-muted">{entry.uniqueToCount}</span>
            </div>

            {showPrizes && (
              <div className="col-span-2 text-right">
                <span className="text-xs text-celo-gold font-medium">
                  {parseFloat(entry.estimatedPrize) > 0
                    ? `$${entry.estimatedPrize}`
                    : "—"}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Restyle leaderboard page with arcade pixel treatment**

Replace the entire contents of `frontend/app/leaderboard/page.tsx` with:

```tsx
"use client";

import { useAccount } from "wagmi";
import { useCurrentRound } from "@/hooks/useCurrentRound";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import Leaderboard from "@/components/Leaderboard";

export default function LeaderboardPage() {
  const { address } = useAccount();
  const { data: round } = useCurrentRound();
  const displayRoundId = round?.roundId?.toString() || undefined;

  const { data: leaderboard, isLoading } = useLeaderboard(displayRoundId);

  return (
    <main className="pt-6 space-y-4">
      <h1 className="font-pixel text-lg text-white">LEADERBOARD</h1>

      {/* Round indicator */}
      {round && (
        <p className="font-pixel text-celo-green" style={{ fontSize: "8px" }}>
          ROUND #{round.roundId.toString()}
        </p>
      )}

      {/* Stats */}
      {leaderboard?.round && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center">
            <p className="font-pixel text-arcade-muted" style={{ fontSize: "5px" }}>
              POT
            </p>
            <p className="font-pixel text-celo-gold glow-gold mt-1" style={{ fontSize: "10px" }}>
              {leaderboard.round.pot} USDT
            </p>
          </div>
          <div className="card text-center">
            <p className="font-pixel text-arcade-muted" style={{ fontSize: "5px" }}>
              PLAYERS
            </p>
            <p className="font-pixel text-white mt-1" style={{ fontSize: "10px" }}>
              {leaderboard.round.playerCount}
            </p>
          </div>
          <div className="card text-center">
            <p className="font-pixel text-arcade-muted" style={{ fontSize: "5px" }}>
              STATUS
            </p>
            <p className="font-pixel text-white mt-1 uppercase" style={{ fontSize: "10px" }}>
              {leaderboard.round.status}
            </p>
          </div>
        </div>
      )}

      {/* Full leaderboard */}
      <Leaderboard
        entries={leaderboard?.entries ?? []}
        isLoading={isLoading}
        showPrizes
        highlightAddress={address}
      />

      {/* Tiebreaker note */}
      {(leaderboard?.entries.some((e, i, arr) =>
        i > 0 && arr[i - 1].streak === e.streak
      )) && (
        <div className="card font-pixel text-arcade-muted text-center" style={{ fontSize: "6px" }}>
          RANKED BY STREAK, THEN TX COUNT, THEN UNIQUE ADDRESSES
        </div>
      )}

      <p className="font-pixel text-arcade-dim text-center pb-2" style={{ fontSize: "5px" }}>
        UPDATES EVERY 30 SECONDS
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -10
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add components/Leaderboard.tsx app/leaderboard/page.tsx && git commit -m "style: arcade pixel leaderboard — text ranks, pixel font, gold highlights"
```

---

### Task 7: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Full build verification**

Run:
```bash
cd frontend && npm run build 2>&1 | tail -30
```
Expected: Build succeeds with no errors. All 13 files modified, zero logic changes.

- [ ] **Step 2: Verify no emoji remain in any component**

Run:
```bash
cd frontend && grep -rn '🔥\|⚡\|✨\|🥇\|🥈\|🥉\|🏠\|🏆\|⏳\|✓\|✗' components/ app/ --include='*.tsx' || echo "No emoji found - clean!"
```
Expected: "No emoji found - clean!" (all emoji have been replaced with pixel text/SVG)

- [ ] **Step 3: Verify pixel font is referenced in all components**

Run:
```bash
cd frontend && grep -l 'font-pixel' components/*.tsx app/**/*.tsx | sort
```
Expected: All 13 files should appear (every component and page uses `font-pixel`).

- [ ] **Step 4: Final commit if any cleanup needed**

Only commit if Steps 1-3 revealed issues that needed fixing. Otherwise skip.

