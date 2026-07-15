import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const writeContract = vi.fn(async () => "0xhash");
const publicClient = {
  getGasPrice: vi.fn(async () => 1000000000n),
  estimateContractGas: vi.fn(async () => 100000n),
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
};
vi.mock("wagmi", () => ({
  usePublicClient: () => publicClient,
  useAccount: () => ({ address: "0xPlayer", isConnected: true }),
  useConfig: () => ({}),
}));
vi.mock("@wagmi/core", () => ({
  getWalletClient: vi.fn(async () => ({ writeContract })),
}));
vi.mock("@/lib/wagmi", () => ({ activeChain: { id: 42220 } }));
vi.mock("@/lib/builderCode", () => ({ BUILDER_SUFFIX: "0xSUFFIX" }));
vi.mock("@/lib/contracts", () => ({
  XP_ADDRESS: "0xXP",
  XP_ABI: [],
}));

import { useClaimXp } from "./useClaimXp";

beforeEach(() => vi.clearAllMocks());

describe("useClaimXp", () => {
  it("claims and reaches done, attributing via dataSuffix", async () => {
    const { result } = renderHook(() => useClaimXp());
    await act(async () => {
      await result.current.claim();
    });
    await waitFor(() => expect(result.current.step).toBe("done"));
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "claimDaily", dataSuffix: "0xSUFFIX" })
    );
  });

  it("sets error on failure", async () => {
    writeContract.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useClaimXp());
    await act(async () => {
      await result.current.claim();
    });
    expect(result.current.step).toBe("error");
  });
});
