import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useClaimRefund", () => ({ useClaimRefund: vi.fn() }));

import ClaimRefundCard from "./ClaimRefundCard";
import { useClaimRefund } from "@/hooks/useClaimRefund";

const mockClaim = vi.mocked(useClaimRefund);

function setClaim(over: Partial<ReturnType<typeof useClaimRefund>> = {}) {
  mockClaim.mockReturnValue({
    claimRefund: vi.fn().mockResolvedValue(undefined),
    step: "idle",
    error: null,
    reset: vi.fn(),
    ...over,
  } as ReturnType<typeof useClaimRefund>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setClaim();
});

const ROUND = 4n;

describe("ClaimRefundCard", () => {
  it("offers the refund with the round number by default", () => {
    render(<ClaimRefundCard roundId={ROUND} />);
    expect(screen.getByText("Refund available")).toBeInTheDocument();
    expect(screen.getByText("Round #4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim refund" })).toBeEnabled();
  });

  it("calls claimRefund then onSuccess on click", async () => {
    const claimRefund = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    setClaim({ claimRefund });
    render(<ClaimRefundCard roundId={ROUND} onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole("button", { name: "Claim refund" }));
    expect(claimRefund).toHaveBeenCalledWith(ROUND);
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("shows a disabled claiming state while in flight", () => {
    setClaim({ step: "claiming" });
    render(<ClaimRefundCard roundId={ROUND} />);
    expect(screen.getByRole("button", { name: "Claiming…" })).toBeDisabled();
  });

  it("renders the success state when done", () => {
    setClaim({ step: "done" });
    render(<ClaimRefundCard roundId={ROUND} />);
    expect(screen.getByText("Refund claimed.")).toBeInTheDocument();
  });

  it("renders an error state with retry that calls reset", async () => {
    const reset = vi.fn();
    setClaim({ step: "error", error: "nope", reset });
    render(<ClaimRefundCard roundId={ROUND} />);
    expect(screen.getByText("nope")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
