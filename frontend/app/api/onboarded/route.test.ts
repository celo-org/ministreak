import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/onboardStore", () => ({
  isOnboarded: vi.fn(),
  markOnboarded: vi.fn(),
}));
vi.mock("@/lib/oracle/profileStore", () => ({
  readProfile: vi.fn(),
}));

import { GET, POST } from "./route";
import { isOnboarded, markOnboarded } from "@/lib/onboardStore";
import { readProfile } from "@/lib/oracle/profileStore";

const get = (url: string) => GET(new Request(url) as any);
const post = (body: unknown) =>
  POST(
    new Request("http://x/api/onboarded", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any
  );

beforeEach(() => vi.clearAllMocks());

describe("GET /api/onboarded", () => {
  it("onboarded when the flag is set", async () => {
    (isOnboarded as any).mockResolvedValue(true);
    const res = await get("http://x/api/onboarded?address=0xABC");
    expect(await res.json()).toEqual({ onboarded: true });
  });

  it("onboarded when a profile exists (returning player)", async () => {
    (isOnboarded as any).mockResolvedValue(false);
    (readProfile as any).mockResolvedValue({ xp: 10 });
    const res = await get("http://x/api/onboarded?address=0xABC");
    expect(await res.json()).toEqual({ onboarded: true });
  });

  it("not onboarded for a brand-new address", async () => {
    (isOnboarded as any).mockResolvedValue(false);
    (readProfile as any).mockResolvedValue(null);
    const res = await get("http://x/api/onboarded?address=0xABC");
    expect(await res.json()).toEqual({ onboarded: false });
  });

  it("400 when the address is missing", async () => {
    const res = await get("http://x/api/onboarded");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ onboarded: false });
  });
});

describe("POST /api/onboarded", () => {
  it("marks the address onboarded", async () => {
    const res = await post({ address: "0xABC" });
    expect(markOnboarded).toHaveBeenCalledWith("0xABC");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("400 without an address", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(markOnboarded).not.toHaveBeenCalled();
  });
});
