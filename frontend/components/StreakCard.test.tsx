import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreakCard from "./StreakCard";

describe("StreakCard", () => {
  it("shows a loading skeleton when isLoading", () => {
    const { container } = render(
      <StreakCard streak={3} todayDone={false} isLoading />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders the streak count and 'days' plural", () => {
    render(<StreakCard streak={5} todayDone />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("days in a row")).toBeInTheDocument();
  });

  it("uses singular 'day' for a streak of 1", () => {
    render(<StreakCard streak={1} todayDone />);
    expect(screen.getByText("day in a row")).toBeInTheDocument();
  });

  it("shows the 'Today’s in' pill when today is done", () => {
    render(<StreakCard streak={2} todayDone />);
    expect(screen.getByText("Today’s in")).toBeInTheDocument();
  });

  it("nudges the user when streak is alive but today isn't done", () => {
    render(<StreakCard streak={2} todayDone={false} />);
    expect(screen.getByText("Pending today")).toBeInTheDocument();
    expect(
      screen.getByText(/Send a transaction on Celo today to keep your streak alive/)
    ).toBeInTheDocument();
  });

  it("does not nudge when streak is 0", () => {
    render(<StreakCard streak={0} todayDone={false} />);
    expect(
      screen.queryByText(/keep your streak alive/)
    ).not.toBeInTheDocument();
  });

  it("shows a 'confirming' state when today is optimistic-only", () => {
    render(<StreakCard streak={3} todayDone optimistic />);
    expect(screen.getByText(/confirming/i)).toBeInTheDocument();
  });

  it("shows the Level badge and XP bar when a profile is provided", () => {
    render(
      <StreakCard
        streak={3}
        todayDone
        profile={{ level: 2, xpIntoLevel: 75, xpForNextLevel: 150 }}
      />
    );
    expect(screen.getByText(/Lv\s*2/i)).toBeInTheDocument();
    expect(screen.getByText(/75\s*\/\s*150\s*XP/i)).toBeInTheDocument();
  });

  it("renders no Level badge without a profile", () => {
    render(<StreakCard streak={3} todayDone />);
    expect(screen.queryByText(/Lv\s*\d/i)).not.toBeInTheDocument();
  });

  it("shows a today-XP chip when todayXp is set", () => {
    render(<StreakCard streak={0} todayDone optimistic todayXp={15} />);
    expect(screen.getByText(/\+15\s*XP/i)).toBeInTheDocument();
  });
});
