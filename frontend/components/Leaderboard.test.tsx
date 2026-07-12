import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Leaderboard from "./Leaderboard";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

const entry = (over: Partial<LeaderboardEntry>): LeaderboardEntry => ({
  address: "0x1111111111111111111111111111111111111111",
  rank: 1,
  streak: 7,
  txCount: 12,
  uniqueToCount: 5,
  estimatedPrize: "0.00",
  ...over,
});

describe("Leaderboard", () => {
  it("renders a skeleton while loading", () => {
    const { container } = render(<Leaderboard entries={[]} isLoading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no entries", () => {
    render(<Leaderboard entries={[]} />);
    expect(screen.getByText(/No players yet/)).toBeInTheDocument();
  });

  it("renders medals for the top 3 ranks", () => {
    render(
      <Leaderboard
        entries={[
          entry({ address: "0xaaa0000000000000000000000000000000000001", rank: 1 }),
          entry({ address: "0xbbb0000000000000000000000000000000000002", rank: 2 }),
          entry({ address: "0xccc0000000000000000000000000000000000003", rank: 3 }),
          entry({ address: "0xddd0000000000000000000000000000000000004", rank: 4 }),
        ]}
        showPrizes={false}
      />
    );
    expect(screen.getByText("🥇")).toBeInTheDocument();
    expect(screen.getByText("🥈")).toBeInTheDocument();
    expect(screen.getByText("🥉")).toBeInTheDocument();
    // rank 4 shows the number, not a medal
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("labels the highlighted address as 'You'", () => {
    const me = "0x1111111111111111111111111111111111111111";
    render(<Leaderboard entries={[entry({ address: me })]} highlightAddress={me.toUpperCase()} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("respects maxRows", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      entry({
        address: `0x${String(i).padStart(40, "0")}`,
        rank: i + 1,
        estimatedPrize: "0.00",
      })
    );
    render(<Leaderboard entries={entries} maxRows={3} showPrizes={false} />);
    // ranks 4,5,6 should not render
    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("shows the estimated prize when positive and a dash when zero", () => {
    render(
      <Leaderboard
        entries={[
          entry({ address: "0xaaa0000000000000000000000000000000000001", rank: 1, estimatedPrize: "5.00" }),
          entry({ address: "0xbbb0000000000000000000000000000000000002", rank: 2, estimatedPrize: "0.00" }),
        ]}
      />
    );
    expect(screen.getByText("$5.00")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("labels the activity value as Score points, not raw tx", () => {
    render(<Leaderboard entries={[entry({ txCount: 12 })]} showPrizes={false} />);
    expect(screen.getByText("12 pts")).toBeInTheDocument();
    expect(screen.queryByText("12 tx")).not.toBeInTheDocument();
  });

  it("shows a LIVE badge when updatedAt is provided", () => {
    const now = Math.floor(Date.now() / 1000);
    render(<Leaderboard entries={[entry({})]} updatedAt={now - 120} showPrizes={false} />);
    expect(screen.getByText(/LIVE/i)).toBeInTheDocument();
    expect(screen.getByText(/2m ago/i)).toBeInTheDocument();
  });

  it("shows no LIVE badge without updatedAt", () => {
    render(<Leaderboard entries={[entry({})]} showPrizes={false} />);
    expect(screen.queryByText(/LIVE/i)).not.toBeInTheDocument();
  });
});
