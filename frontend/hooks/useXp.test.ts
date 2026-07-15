import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const useReadContract = vi.fn();
vi.mock("wagmi", () => ({
  useReadContract: (args: unknown) => useReadContract(args),
}));
vi.mock("@/lib/contracts", () => ({
  XP_ADDRESS: "0xXP",
  XP_ABI: [],
}));

import { useXp } from "./useXp";
import { xpProgress } from "@/lib/xp";

beforeEach(() => vi.clearAllMocks());

describe("useXp", () => {
  it("converts the raw xp bigint to a Number and reports canClaim=true", () => {
    useReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "xp") return { data: 150n, refetch: vi.fn() };
      if (functionName === "canClaim") return { data: true, refetch: vi.fn() };
      throw new Error(`unexpected functionName ${functionName}`);
    });

    const { result } = renderHook(() => useXp("0xPlayer"));

    expect(result.current.xp).toBe(150);
    expect(result.current.canClaim).toBe(true);
    expect(result.current.canClaimKnown).toBe(true);

    // Derived level/xpIntoLevel/xpForNextLevel must match xpProgress(xp) directly.
    const expected = xpProgress(150);
    expect(expected.level).toBeGreaterThan(1); // meaningful case, not the level-1 floor
    expect(result.current.level).toBe(expected.level);
    expect(result.current.xpIntoLevel).toBe(expected.xpIntoLevel);
    expect(result.current.xpForNextLevel).toBe(expected.xpForNextLevel);
  });

  it("reports canClaim=false when the read returns boolean false", () => {
    useReadContract.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === "xp") return { data: 0n, refetch: vi.fn() };
      if (functionName === "canClaim") return { data: false, refetch: vi.fn() };
      throw new Error(`unexpected functionName ${functionName}`);
    });

    const { result } = renderHook(() => useXp("0xPlayer"));

    expect(result.current.canClaim).toBe(false);
    expect(result.current.canClaimKnown).toBe(true);
  });

  it("reports canClaim=false and canClaimKnown=false when the read data is undefined (loading/unset)", () => {
    useReadContract.mockImplementation(() => ({ data: undefined, refetch: vi.fn() }));

    const { result } = renderHook(() => useXp("0xPlayer"));

    expect(result.current.canClaim).toBe(false);
    expect(result.current.canClaimKnown).toBe(false);
    expect(result.current.xp).toBe(0);
  });

  it("disables both reads and defaults to xpProgress(0) when no address is given", () => {
    useReadContract.mockImplementation(({ query }: { query: { enabled: boolean } }) => {
      expect(query.enabled).toBe(false);
      return { data: undefined, refetch: vi.fn() };
    });

    const { result } = renderHook(() => useXp(undefined));

    expect(result.current.xp).toBe(0);
    expect(result.current.canClaim).toBe(false);

    const expected = xpProgress(0);
    expect(result.current.level).toBe(expected.level);
    expect(result.current.xpIntoLevel).toBe(expected.xpIntoLevel);
    expect(result.current.xpForNextLevel).toBe(expected.xpForNextLevel);
  });
});
