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
