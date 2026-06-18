import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import RoundTimer from "./RoundTimer";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 0, 8, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

const nowSec = () => Math.floor(Date.now() / 1000);

describe("RoundTimer", () => {
  it("renders a loading skeleton when endTime is undefined", () => {
    const { container } = render(<RoundTimer endTime={undefined} />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows the awaiting-resolution state once the round has ended", () => {
    render(<RoundTimer endTime={BigInt(nowSec() - 100)} />);
    expect(
      screen.getByText("Round ended — awaiting resolution")
    ).toBeInTheDocument();
  });

  it("renders a four-segment countdown for a future endTime", () => {
    // 1 day, 2 hours, 3 minutes, 4 seconds from now
    const delta = 1 * 86400 + 2 * 3600 + 3 * 60 + 4;
    render(<RoundTimer endTime={BigInt(nowSec() + delta)} />);
    expect(screen.getByText("Round ends in")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument(); // days
    expect(screen.getByText("02")).toBeInTheDocument(); // hours
    expect(screen.getByText("03")).toBeInTheDocument(); // minutes
    expect(screen.getByText("04")).toBeInTheDocument(); // seconds
    expect(screen.getByText("days")).toBeInTheDocument();
    expect(screen.getByText("hrs")).toBeInTheDocument();
  });
});
