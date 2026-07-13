import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOnboarding } from "./useOnboarding";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const mockFetch = (onboarded: boolean) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ onboarded }) }) as any)
  );

describe("useOnboarding — no wallet (plain browser)", () => {
  it("opens on first run when the flag is unset", () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.open).toBe(true); // effect runs during render in RTL
  });

  it("dismiss sets the flag and closes", () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem("ms_onboarded")).toBe("1");
  });

  it("stays closed on a later mount once the flag is set", () => {
    localStorage.setItem("ms_onboarded", "1");
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.open).toBe(false);
  });

  it("show re-opens without clearing the flag", () => {
    localStorage.setItem("ms_onboarded", "1");
    const { result } = renderHook(() => useOnboarding());
    act(() => result.current.show());
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem("ms_onboarded")).toBe("1");
  });
});

describe("useOnboarding — wallet connected (server-authoritative)", () => {
  it("stays closed when the server says the wallet is onboarded", async () => {
    mockFetch(true);
    const { result } = renderHook(() => useOnboarding("0xABC"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(result.current.open).toBe(false);
  });

  it("opens when the server says the wallet is new", async () => {
    mockFetch(false);
    const { result } = renderHook(() => useOnboarding("0xABC"));
    await waitFor(() => expect(result.current.open).toBe(true));
  });

  it("does not open a wallet already dismissed on this device", async () => {
    localStorage.setItem("ms_onboarded", "1");
    mockFetch(false);
    const { result } = renderHook(() => useOnboarding("0xABC"));
    expect(result.current.open).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("dismiss POSTs the wallet to the server", async () => {
    const fetchFn = vi.fn(async () => ({ json: async () => ({ onboarded: false }) }) as any);
    vi.stubGlobal("fetch", fetchFn);
    const { result } = renderHook(() => useOnboarding("0xABC"));
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/onboarded",
      expect.objectContaining({ method: "POST" })
    );
  });
});
