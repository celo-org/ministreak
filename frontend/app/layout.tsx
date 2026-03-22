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
  metadataBase: new URL("https://frontend-ch20jts8y-onelegteagmailcoms-projects.vercel.app"),
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
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <Providers>
          <div className="max-w-md mx-auto px-4 pb-24">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
