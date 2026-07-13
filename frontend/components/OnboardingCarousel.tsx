"use client";

import { useEffect, useRef, useState, type ReactNode, type ComponentType, type SVGProps } from "react";
import { StreakIcon, TrophyIcon, FreezeIcon } from "@/components/icons";

interface Screen {
  badge: ReactNode;
  title: string;
  body: ReactNode;
}

function Badge({ Icon }: { Icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <div className="w-24 h-24 rounded-full bg-forest-tint text-forest-deep grid place-items-center">
      <Icon width={44} height={44} />
    </div>
  );
}

const SCREENS: Screen[] = [
  {
    // eslint-disable-next-line @next/next/no-img-element
    badge: <img src="/Logo_Color.svg" alt="MiniStreak" className="w-52 max-w-[70%]" />,
    title: "Welcome to MiniStreak",
    body: (
      <>A weekly streak game on Celo. Show up every day, keep your streak alive, and win real USDT.</>
    ),
  },
  {
    badge: <Badge Icon={StreakIcon} />,
    title: "Play in 2 steps",
    body: (
      <>
        1. Pay <strong>0.10 USDT</strong> to join this week's round.
        <br />
        2. Make at least one transaction <strong>every day</strong> to grow your streak.
      </>
    ),
  },
  {
    badge: <Badge Icon={TrophyIcon} />,
    title: "How you win",
    body: (
      <>
        Longest streaks take the pot. Ties break by <strong>Score</strong> (your daily activity —
        spamming doesn't help), then unique people you paid. Top 3 split the pot{" "}
        <strong>50 / 30 / 20</strong>.
      </>
    ),
  },
  {
    badge: <Badge Icon={FreezeIcon} />,
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

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

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
      aria-label={screen.title}
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
        <div className="flex items-center justify-center" aria-hidden>
          {screen.badge}
        </div>
        <h2 className="font-display font-semibold text-2xl text-ink tracking-tight">{screen.title}</h2>
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
