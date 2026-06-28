import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted via next/font: no render-blocking request, and the generated
// size-adjust fallback metrics eliminate font-swap layout shift (CLS).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains",
  display: "swap",
});

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
  metadataBase: new URL("https://www.ministreak.app"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/Favicon_Color.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "MiniStreak",
    description: "Weekly transaction streak leaderboard on Celo",
    type: "website",
    images: [
      { url: "/og-image.webp", width: 1200, height: 630, type: "image/webp" },
      { url: "/og-image.png", width: 1200, height: 630, type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen">
        <Providers>
          <div className="max-w-md mx-auto px-5 pb-28">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
