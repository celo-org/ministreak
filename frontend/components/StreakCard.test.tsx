import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreakCard from "./StreakCard";

describe("StreakCard", () => {
  it("shows a loading skeleton when isLoading", () => {
    const { container } = render(<StreakCard streak={3} todayDone={false} isLoading />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders the streak as '{n}-day streak'", () => {
    render(<StreakCard streak={5} todayDone />);
    expect(screen.getByText("5-day streak")).toBeInTheDocument();
  });

  it("uses singular for a streak of 1", () => {
    render(<StreakCard streak={1} todayDone />);
    expect(screen.getByText("1-day streak")).toBeInTheDocument();
  });

  it("prompts to start when streak is 0", () => {
    render(<StreakCard streak={0} todayDone={false} />);
    expect(screen.getByText(/Start your streak/i)).toBeInTheDocument();
  });

  it("shows the 'Today’s in' pill when today is done", () => {
    render(<StreakCard streak={2} todayDone />);
    expect(screen.getByText("Today’s in")).toBeInTheDocument();
  });

  it("shows a 'confirming' state when today is optimistic-only", () => {
    render(<StreakCard streak={3} todayDone optimistic />);
    expect(screen.getByText(/confirming/i)).toBeInTheDocument();
  });

  it("nudges the user when streak is alive but today isn't done", () => {
    render(<StreakCard streak={2} todayDone={false} />);
    expect(screen.getByText("Pending today")).toBeInTheDocument();
    expect(screen.getByText(/keep your streak alive/)).toBeInTheDocument();
  });

  it("does not nudge when streak is 0", () => {
    render(<StreakCard streak={0} todayDone={false} />);
    expect(screen.queryByText(/keep your streak alive/)).not.toBeInTheDocument();
  });

  it("shows the level and freeze count when a profile is provided", () => {
    render(<StreakCard streak={3} todayDone profile={{ level: 2, freezeTokens: 2 }} />);
    expect(screen.getByText(/Lv\s*2/)).toBeInTheDocument();
    expect(screen.getByText(/2 banked/)).toBeInTheDocument();
  });

  it("renders no level without a profile", () => {
    render(<StreakCard streak={3} todayDone />);
    expect(screen.queryByText(/Lv\s*\d/)).not.toBeInTheDocument();
  });

  it("shows no freeze count at zero tokens", () => {
    render(<StreakCard streak={3} todayDone profile={{ level: 2, freezeTokens: 0 }} />);
    expect(screen.queryByText(/banked/)).not.toBeInTheDocument();
  });
});
