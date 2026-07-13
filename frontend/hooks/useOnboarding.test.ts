import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnboarding } from "./useOnboarding";

beforeEach(() => localStorage.clear());

describe("useOnboarding", () => {
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
