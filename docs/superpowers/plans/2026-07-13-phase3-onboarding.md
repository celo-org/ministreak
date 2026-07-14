# Phase 3 — Onboarding Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-run onboarding carousel that explains MiniStreak to new MiniPay users — 4 swipeable screens, shown once (localStorage), skippable, and re-openable from the "How to play" card. Pure frontend, editorial style, no backend/wallet/contract dependency.

**Architecture:** A presentational `OnboardingCarousel` (props `open`, `onDismiss`) + a `useOnboarding` hook that owns the localStorage first-run logic (SSR-safe: reads only in `useEffect`). `page.tsx` wires them and adds a "Replay intro" link.

**Tech Stack:** Next.js 14 (App Router, client components), React, Tailwind, Vitest + @testing-library/react.

## Global Constraints

- **Pure frontend.** No backend, no KV, no wallet/contract dependency. Renders regardless of connection.
- **SSR-safe:** `useOnboarding` starts `open=false`; the first-run localStorage check runs only inside `useEffect`. Never touch `window`/`localStorage` during render. All localStorage access wrapped in try/catch (unavailable → carousel just doesn't show).
- **Editorial style only** — reuse existing classes: `bg-paper`, `text-ink`, `text-ink-mute`, `text-forest`, `bg-forest`, `bg-paper-deep`, `btn-primary`. No restyle.
- **localStorage key:** `ms_onboarded` (value `"1"` once dismissed).
- **Approved copy is fixed** (see Task 1) — do not paraphrase.
- **All commands run from `frontend/`.** Test: `npm test` / `npx vitest run <path>`. Commit per task. TDD, DRY, YAGNI.

---

### Task 1: `OnboardingCarousel` component

**Files:**
- Create: `frontend/components/OnboardingCarousel.tsx`
- Test: `frontend/components/OnboardingCarousel.test.tsx`

**Interfaces:**
- Produces: `OnboardingCarousel({ open, onDismiss }: { open: boolean; onDismiss: () => void })` — renders null when `!open`; otherwise a full-screen overlay with 4 screens, Next/Skip, dots, and a final "Get started" that calls `onDismiss`.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/OnboardingCarousel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OnboardingCarousel from "./OnboardingCarousel";

describe("OnboardingCarousel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<OnboardingCarousel open={false} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the first screen when open", () => {
    render(<OnboardingCarousel open onDismiss={() => {}} />);
    expect(screen.getByText(/Welcome to MiniStreak/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
  });

  it("advances through screens with Next and ends with Get started", () => {
    render(<OnboardingCarousel open onDismiss={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Next/i })); // -> screen 2
    expect(screen.getByText(/Play in 2 steps/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i })); // -> screen 3
    expect(screen.getByText(/How you win/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i })); // -> screen 4
    expect(screen.getByText(/Keep your edge/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get started/i })).toBeInTheDocument();
  });

  it("calls onDismiss from the final Get started", () => {
    const onDismiss = vi.fn();
    render(<OnboardingCarousel open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Get started/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("calls onDismiss from Skip", () => {
    const onDismiss = vi.fn();
    render(<OnboardingCarousel open onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/OnboardingCarousel.test.tsx`
Expected: FAIL — `Failed to resolve import "./OnboardingCarousel"`.

- [ ] **Step 3: Write the component**

Create `frontend/components/OnboardingCarousel.tsx`:

```tsx
"use client";

import { useRef, useState, type ReactNode } from "react";

interface Screen {
  glyph: string;
  title: string;
  body: ReactNode;
}

const SCREENS: Screen[] = [
  {
    glyph: "🔥",
    title: "Welcome to MiniStreak",
    body: (
      <>A weekly streak game on Celo. Show up every day, keep your streak alive, and win real USDT.</>
    ),
  },
  {
    glyph: "🎟️",
    title: "Play in 2 steps",
    body: (
      <>
        1. Pay <strong>0.10 USDT</strong> to join this week’s round.
        <br />
        2. Make at least one transaction <strong>every day</strong> to grow your streak.
      </>
    ),
  },
  {
    glyph: "🏆",
    title: "How you win",
    body: (
      <>
        Longest streaks take the pot. Ties break by <strong>Score</strong> (your daily activity —
        spamming doesn’t help), then unique people you paid. Top 3 split the pot{" "}
        <strong>50 / 30 / 20</strong>.
      </>
    ),
  },
  {
    glyph: "🛡️",
    title: "Keep your edge",
    body: (
      <>
        Earn <strong>XP</strong> and level up as you play. Reach milestones to bank a{" "}
        <strong>streak-freeze</strong> — miss a day without breaking your streak. Return each week
        for a <strong>loyalty boost</strong>.
      </>
    ),
  },
];

export default function OnboardingCarousel({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(0);

  if (!open) return null;

  const isLast = index === SCREENS.length - 1;
  const screen = SCREENS[index];
  const next = () => (isLast ? onDismiss() : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-paper"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to MiniStreak"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (dx < -40) next();
        else if (dx > 40) prev();
      }}
    >
      <div className="flex justify-end p-4">
        <button onClick={onDismiss} className="text-ink-mute text-sm">
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
        <div className="text-6xl" aria-hidden>
          {screen.glyph}
        </div>
        <h2 className="font-sans font-bold text-2xl text-ink tracking-tight">{screen.title}</h2>
        <p className="text-ink-mute leading-relaxed max-w-sm">{screen.body}</p>
      </div>

      <div className="flex items-center justify-center gap-2 pb-4">
        {SCREENS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-forest" : "bg-paper-deep"}`}
          />
        ))}
      </div>

      <div className="p-6">
        <button onClick={next} className="btn-primary w-full">
          {isLast ? "Get started" : "Next"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/OnboardingCarousel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/OnboardingCarousel.tsx frontend/components/OnboardingCarousel.test.tsx
git commit -m "feat(onboarding): first-run carousel component"
```

---

### Task 2: `useOnboarding` hook

**Files:**
- Create: `frontend/hooks/useOnboarding.ts`
- Test: `frontend/hooks/useOnboarding.test.ts`

**Interfaces:**
- Produces: `useOnboarding(): { open: boolean; show: () => void; dismiss: () => void }`. First mount with no `ms_onboarded` flag → `open` becomes true (in `useEffect`); `dismiss()` sets the flag + closes; `show()` opens without clearing the flag.

- [ ] **Step 1: Write the failing test**

Create `frontend/hooks/useOnboarding.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnboarding } from "./useOnboarding";

beforeEach(() => localStorage.clear());

describe("useOnboarding", () => {
  it("opens on first run when the flag is unset", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.open).toBe(true); // effect runs during render in RTL
  });

  it("dismiss sets the flag and closes", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem("ms_onboarded")).toBe("1");
  });

  it("stays closed on a later mount once the flag is set", () => {
    localStorage.setItem("ms_onboarded", "1");
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.open).toBe(false);
  });

  it("show re-opens without clearing the flag", () => {
    localStorage.setItem("ms_onboarded", "1");
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.show());
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem("ms_onboarded")).toBe("1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run hooks/useOnboarding.test.ts`
Expected: FAIL — `Failed to resolve import "./useOnboarding"`.

- [ ] **Step 3: Write the hook**

Create `frontend/hooks/useOnboarding.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run hooks/useOnboarding.test.ts`
Expected: PASS (4 tests). (RTL's `renderHook` runs effects synchronously, so `open` is true after the initial render when the flag is unset.)

- [ ] **Step 5: Commit**

```bash
git add frontend/hooks/useOnboarding.ts frontend/hooks/useOnboarding.test.ts
git commit -m "feat(onboarding): useOnboarding first-run hook"
```

---

### Task 3: Wire into the home page

**Files:**
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: `useOnboarding`, `OnboardingCarousel`.
- Produces: the carousel renders on first visit; a "Replay intro" link in the "How to play" card re-opens it.

- [ ] **Step 1: Add imports**

In `frontend/app/page.tsx`, add beside the existing imports:

```tsx
import OnboardingCarousel from "@/components/OnboardingCarousel";
import { useOnboarding } from "@/hooks/useOnboarding";
```

- [ ] **Step 2: Call the hook**

Inside `HomePage`, near the other hook calls (e.g. right after `const [howToOpen, setHowToOpen] = useState(false);`), add:

```tsx
  const onboarding = useOnboarding();
```

- [ ] **Step 3: Render the carousel**

Immediately after the `<main className="pt-10 space-y-6">` opening tag, add:

```tsx
      <OnboardingCarousel open={onboarding.open} onDismiss={onboarding.dismiss} />
```

(It's a fixed overlay, so its position in the tree doesn't matter; it renders null when closed.)

- [ ] **Step 4: Add the "Replay intro" link**

In the "How to play" `<section>`, add a link after the `{howToOpen && ( … )}` block and before the section's closing `</section>` tag (currently ~line 220):

```tsx
        <button
          onClick={onboarding.show}
          className="mt-4 text-sm text-forest underline"
        >
          Replay intro
        </button>
```

- [ ] **Step 5: Type-check + full suite**

Run: `npm run type-check && npm test`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(onboarding): show carousel on first run + Replay intro link"
```

> **Manual verification:** `npm run dev`, clear `localStorage` (or use a fresh browser profile), load the home page → the carousel appears; step through with Next / swipe; "Get started" and "Skip" both dismiss it and it does not reappear on reload; "Replay intro" in the How-to-play card re-opens it.

---

## Final verification

- [ ] Full suite: `cd frontend && npm test` → all pass.
- [ ] Type-check: `npm run type-check` → clean.
- [ ] Manual: first-run shows; dismiss persists across reload; Replay intro re-opens.

## Spec coverage (self-review)

- 4-screen carousel, approved copy → Task 1. ✓
- localStorage first-run gate, SSR-safe, degrades → Task 2. ✓
- Skip / Next / Get started / dots / swipe → Task 1. ✓
- Re-open via "Replay intro" in How-to-play → Task 3. ✓
- Wire first-run trigger → Task 3. ✓
- Pure frontend, editorial style, no restyle → whole plan. ✓

## Notes for the implementer

- The copy in Task 1 is the approved product copy — transcribe it exactly (including “Score”, “streak-freeze”, “loyalty boost”, and the 50 / 30 / 20 split).
- `useOnboarding` must never read `localStorage` during render — only inside the `useEffect` — to stay SSR/hydration-safe.
- Don’t restyle anything; reuse the existing `bg-paper` / `text-ink` / `btn-primary` classes as in the component code.
