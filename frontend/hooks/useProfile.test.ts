import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const useXpMock = vi.fn();
vi.mock("./useXp", () => ({
  useXp: (address?: string) => useXpMock(address),
}));

import { useProfile } from "./useProfile";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  useXpMock.mockReturnValue({
    xp: 175,
    level: 2,
    xpIntoLevel: 75,
    xpForNextLevel: 150,
    canClaim: true,
    refetch: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useProfile", () => {
  it("returns null without an address", () => {
    const { result } = renderHook(() => useProfile(undefined), { wrapper });
    expect(result.current.profile).toBeNull();
    expect(useXpMock).toHaveBeenCalledWith(undefined);
  });

  it("composes on-chain xp/level with KV freezeTokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ profile: { freezeTokens: 3 } }),
      })) as any
    );

    const { result } = renderHook(() => useProfile("0xABC"), { wrapper });

    await waitFor(() => expect(result.current.profile?.freezeTokens).toBe(3));

    expect(result.current.profile).toEqual({
      xp: 175,
      level: 2,
      xpIntoLevel: 75,
      xpForNextLevel: 150,
      freezeTokens: 3,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile?address=0xABC",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("defaults freezeTokens to 0 while the fetch is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})) as any
    );

    const { result } = renderHook(() => useProfile("0xABC"), { wrapper });

    expect(result.current.profile).toEqual({
      xp: 175,
      level: 2,
      xpIntoLevel: 75,
      xpForNextLevel: 150,
      freezeTokens: 0,
    });
  });

  it("falls back to freezeTokens 0 when the fetch response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ profile: null }) })) as any
    );

    const { result } = renderHook(() => useProfile("0xABC"), { wrapper });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(result.current.profile?.freezeTokens).toBe(0));
  });
});
