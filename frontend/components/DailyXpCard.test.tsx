import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useClaimXp", () => ({ useClaimXp: vi.fn() }));
vi.mock("@/hooks/useXp", () => ({ useXp: vi.fn() }));
vi.mock("wagmi", () => ({ useReadContract: vi.fn(() => ({ data: 10n })) }));
vi.mock("@/lib/contracts", () => ({ XP_ADDRESS: "0xXP", XP_ABI: [] }));

import DailyXpCard from "./DailyXpCard";
import { useClaimXp } from "@/hooks/useClaimXp";
import { useXp } from "@/hooks/useXp";

const mockClaimXp = vi.mocked(useClaimXp);
const mockXp = vi.mocked(useXp);

const claim = vi.fn();
const refetch = vi.fn();

function setClaimXp(over: Partial<ReturnType<typeof useClaimXp>> = {}) {
  mockClaimXp.mockReturnValue({
    claim,
    step: "idle",
    txHash: null,
    error: null,
    reset: vi.fn(),
    ...over,
  } as ReturnType<typeof useClaimXp>);
}

function setXp(over: Partial<ReturnType<typeof useXp>> = {}) {
  mockXp.mockReturnValue({
    xp: 0,
    canClaim: true,
    refetch,
    level: 1,
    xpIntoLevel: 0,
    xpForNextLevel: 50,
    ...over,
  } as ReturnType<typeof useXp>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setClaimXp();
  setXp();
});

describe("DailyXpCard", () => {
  it("shows the claim button when canClaim is true", () => {
    render(<DailyXpCard address="0xPlayer" currentDayIndex={2} />);
    expect(screen.getByRole("button", { name: /Claim today's XP/ })).toBeInTheDocument();
  });

  it("shows the claimed state when canClaim is false", () => {
    setXp({ canClaim: false });
    render(<DailyXpCard address="0xPlayer" currentDayIndex={2} />);
    const btn = screen.getByRole("button", { name: /Claimed \+10 today/ });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("calls claim() when the claim button is clicked", async () => {
    const user = userEvent.setup();
    render(<DailyXpCard address="0xPlayer" currentDayIndex={2} />);
    await user.click(screen.getByRole("button", { name: /Claim today's XP/ }));
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("shows the error message and a Try again button when the claim fails", async () => {
    const reset = vi.fn();
    setClaimXp({ step: "error", error: "Transaction rejected", reset });
    const user = userEvent.setup();
    render(<DailyXpCard address="0xPlayer" currentDayIndex={2} />);
    expect(screen.getByText("Transaction rejected")).toBeInTheDocument();
    const tryAgainBtn = screen.getByRole("button", { name: /Try again/ });
    expect(tryAgainBtn).toBeInTheDocument();
    await user.click(tryAgainBtn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
