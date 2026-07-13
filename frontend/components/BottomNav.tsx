"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, BoardIcon, MeIcon } from "@/components/icons";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/leaderboard", label: "Board", Icon: BoardIcon },
  { href: "/me", label: "Me", Icon: MeIcon },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-paper/95 backdrop-blur-sm"
      style={{ boxShadow: "0 -1px 0 #E5DEC8, 0 -8px 24px -16px rgba(27,26,23,0.10)" }}
    >
      <div className="max-w-md mx-auto flex">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-colors ${
                isActive ? "text-forest" : "text-ink-faint"
              }`}
            >
              <Icon width={23} height={23} />
              <span className="font-display text-[11px] font-bold tracking-[0.02em]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
