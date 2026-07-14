/**
 * icons.tsx — MiniStreak brand icon set.
 * Monochrome, single-weight, filled silhouettes (fill: currentColor) so each
 * icon recolours via its container. No emoji anywhere in the app; use these.
 * Paths match the approved redesign mockup.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, viewBox = "0 0 24 24", ...props }: IconProps) {
  return (
    <svg viewBox={viewBox} fill="currentColor" aria-hidden {...props}>
      {children}
    </svg>
  );
}

/** Streak — flame. */
export function StreakIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 2.2c.4 2.8-1.7 4-1.7 6 0 1 .8 1.6 1.5 1.1.9-.7 1-2 1.4-3.2 1.9 1.7 3.3 4 3.3 6.7a6 6 0 1 1-12 0c0-3 1.8-5.2 2.6-7.3.3-.8.3-1.7.2-2.5 1.6 1 2.7 2.5 3 4.4.9-1.2 1.2-3 .1-5.4z" />
    </Svg>
  );
}

/** Score / daily XP — four-point spark. */
export function ScoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5c.7 4 2.9 6.2 7 6.9-4.1.7-6.3 2.9-7 6.9-.7-4-2.9-6.2-7-6.9 4.1-.7 6.3-2.9 7-6.9zM18.5 15c.3 1.8 1.3 2.8 3.2 3.2-1.9.4-2.9 1.4-3.2 3.2-.3-1.8-1.3-2.8-3.2-3.2 1.9-.4 2.9-1.4 3.2-3.2z" />
    </Svg>
  );
}

/** Freeze — shield with a snow mark. */
export function FreezeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.3l7 2.4v6c0 4.4-2.9 7.8-7 9.7-4.1-1.9-7-5.3-7-9.7v-6l7-2.4zm0 5.1c-.4 0-.7.3-.7.7v1.6l-1.4-.8a.7.7 0 1 0-.7 1.2l1.4.8-1.4.8a.7.7 0 1 0 .7 1.2l1.4-.8v1.6a.7.7 0 1 0 1.4 0v-1.6l1.4.8a.7.7 0 1 0 .7-1.2l-1.4-.8 1.4-.8a.7.7 0 1 0-.7-1.2l-1.4.8V8.1c0-.4-.3-.7-.7-.7z" />
    </Svg>
  );
}

/** Rank / trophy. */
export function TrophyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h10v1.5h3.2V7a3.8 3.8 0 0 1-3.8 3.8h-.2A5.9 5.9 0 0 1 13 15.4V18h3.2v2H7.8v-2H11v-2.6A5.9 5.9 0 0 1 7.8 10.8h-.2A3.8 3.8 0 0 1 3.8 7V4.5H7V3zm-.1 3.2H5.6V7c0 1 .6 1.7 1.5 2 .01-.9-.1-1.9-.2-2.8zm10.2 0c-.1.9-.2 1.9-.2 2.8.9-.3 1.5-1 1.5-2v-.8h-1.3z" />
    </Svg>
  );
}

/** Crown — podium winner. */
export function CrownIcon(props: IconProps) {
  return (
    <Svg viewBox="0 0 22 16" {...props}>
      <path d="M2 5l3.5 3L11 2l5.5 6L20 5l-1.5 9h-15L2 5z" />
    </Svg>
  );
}

/** Medal — rank-1 star. */
export function MedalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2l2.6 5.6L20 8.5l-4 4 1 5.7L12 15.5 7 18.2l1-5.7-4-4 5.4-.9z" />
    </Svg>
  );
}

/** Me / profile — single figure. */
export function MeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm0 8.8c-3.7 0-7 1.9-7 4.7V19c0 .7.5 1.2 1.2 1.2h11.6c.7 0 1.2-.5 1.2-1.2v-2.1c0-2.8-3.3-4.7-7-4.7z" />
    </Svg>
  );
}

/** Home. */
export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.1 3.4 10c-.4.3-.5.9-.2 1.3.3.4.9.5 1.3.2l.4-.3V19c0 .6.4 1 1 1h4.3v-4.5c0-.4.3-.8.8-.8h2c.4 0 .8.3.8.8V20H18c.6 0 1-.4 1-1v-7.8l.4.3c.4.3 1 .2 1.3-.2.3-.4.2-1-.2-1.3L12 3.1z" />
    </Svg>
  );
}

/** Board — a small cluster of figures (the collective). */
export function BoardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 12.5c-1.7 0-3 1-3 2.6V19c0 .6.4 1 1 1h4v-4.9c0-1.6-1.3-2.6-2-2.6zm8 0c-.7 0-2 1-2 2.6V20h4c.6 0 1-.4 1-1v-3.9c0-1.6-1.3-2.6-3-2.6zm-4-8.5c-1.9 0-3.4 1.5-3.4 3.4S10.1 10.8 12 10.8s3.4-1.5 3.4-3.4S13.9 4 12 4zm-4.9.9C5.7 4.9 4.6 6 4.6 7.4S5.7 9.9 7.1 9.9c.35 0 .7-.07 1-.2A4.3 4.3 0 0 1 7.4 5.1zm9.8 0A4.3 4.3 0 0 1 15.9 9.7c.3.13.65.2 1 .2 1.4 0 2.5-1.1 2.5-2.5S18.3 4.9 16.9 4.9z" />
    </Svg>
  );
}
