"use client";

import { useEffect, useState } from "react";

interface RoundTimerProps {
  endTime: bigint | undefined;
  variant?: "card" | "hero";
}

function formatDuration(seconds: number) {
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

export default function RoundTimer({ endTime, variant = "card" }: RoundTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const hero = variant === "hero";

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
    return hero ? null : <div className="h-20 bg-paper-tint rounded-2xl animate-pulse" />;
  }

  if (secondsLeft === 0) {
    return hero ? (
      <p className="text-xs opacity-90">Round ended — awaiting resolution</p>
    ) : (
      <div className="card text-center">
        <p className="eyebrow">Round ended — awaiting resolution</p>
      </div>
    );
  }

  // Hero variant: compact translucent chips inside the pot gradient.
  if (hero) {
    const segs = [
      { label: "Days", value: days },
      { label: "Hrs", value: hours },
      { label: "Min", value: minutes },
    ];
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {segs.map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-white/[0.16] py-1.5 text-center">
            <span className="block font-display font-semibold text-lg num leading-none">{value}</span>
            <span className="block text-[9px] uppercase tracking-[0.08em] opacity-85 mt-0.5">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  const segments = [
    { label: "days", value: days },
    { label: "hrs", value: hours },
    { label: "min", value: minutes },
    { label: "sec", value: seconds },
  ];

  return (
    <div className="card">
      <p className="eyebrow mb-3">Round ends in</p>
      <div className="grid grid-cols-4 gap-2">
        {segments.map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="rounded-xl bg-paper-tint border border-rule py-3">
              <span className="display-md num">{value}</span>
            </div>
            <span className="block mt-1.5 text-[11px] uppercase tracking-cap text-ink-mute">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
