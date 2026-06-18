import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useEnterRound", () => ({ useEnterRound: vi.fn() }));
vi.mock("@/hooks/useEntryEligibility", () => ({ useEntryEligibility: vi.fn() }));

import EntryButton from "./EntryButton";
import { useEnterRound } from "@/hooks/useEnterRound";
import { useEntryEligibility } from "@/hooks/useEntryEligibility";

const mockEnter = vi.mocked(useEnterRound);
const mockEligibility = vi.mocked(useEntryEligibility);

function setEnter(over: Partial<ReturnType<typeof useEnterRound>> = {}) {
  mockEnter.mockReturnValue({
    enterRound: vi.fn().mockResolvedValue(undefined),
    step: "idle",
    error: null,
    reset: vi.fn(),
    ...over,
  } as ReturnType<typeof useEnterRound>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnter();
  mockEligibility.mockReturnValue({ status: "ready", usdt: 1_000_000n } as ReturnType<typeof useEntryEligibility>);
});

const ROUND = 7n;

describe("EntryButton", () => {
  it("shows the entered state when already in", () => {
    render(<EntryButton roundId={ROUND} isEntered isOpen />);
    expect(screen.getByText("You’re in this week")).toBeInTheDocument();
  });

  it("disables entry when the round is closed", () => {
    render(<EntryButton roundId={ROUND} isEntered={false} isOpen={false} />);
    const btn = screen.getByRole("button", { name: "Round closed" });
    expect(btn).toBeDisabled();
  });

  it("prompts to swap when USDT is needed", () => {
    mockEligibility.mockReturnValue({
      status: "swap_needed",
      usdt: 0n,
      usdc: 5n,
      usdm: 0n,
    } as ReturnType<typeof useEntryEligibility>);
    render(<EntryButton roundId={ROUND} isEntered={false} isOpen />);
    expect(screen.getByText("USDT needed.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get USDT" })).toBeInTheDocument();
  });

  it("prompts to deposit when balance is too low", () => {
    mockEligibility.mockReturnValue({
      status: "deposit_needed",
      usdt: 0n,
      usdc: 0n,
      usdm: 0n,
    } as ReturnType<typeof useEntryEligibility>);
    render(<EntryButton roundId={ROUND} isEntered={false} isOpen />);
    expect(screen.getByText("Low balance.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deposit USDT" })).toBeInTheDocument();
  });

  it("shows an error state with a retry that calls reset", async () => {
    const reset = vi.fn();
    setEnter({ step: "error", error: "boom", reset });
    render(<EntryButton roundId={ROUND} isEntered={false} isOpen />);
    expect(screen.getByText("boom")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("calls enterRound then onSuccess when the ready button is clicked", async () => {
    const enterRound = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    setEnter({ enterRound });
    render(<EntryButton roundId={ROUND} isEntered={false} isOpen onSuccess={onSuccess} />);

    await userEvent.click(
      screen.getByRole("button", { name: /Enter this week/ })
    );
    expect(enterRound).toHaveBeenCalledWith(ROUND);
    // onSuccess fires after the enterRound promise resolves
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("shows the approving label while a tx is in flight", () => {
    setEnter({ step: "approving" });
    render(<EntryButton roundId={ROUND} isEntered={false} isOpen />);
    const btn = screen.getByRole("button", { name: "Approving…" });
    expect(btn).toBeDisabled();
  });
});
