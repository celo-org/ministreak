import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/oracle/profileStore", () => ({
  readProfile: vi.fn(),
}));

import { GET } from "./route";
import { readProfile } from "@/lib/oracle/profileStore";

const req = (url: string) => new Request(url) as any;

beforeEach(() => vi.clearAllMocks());

describe("GET /api/profile", () => {
  it("returns freeze tokens only for an address", async () => {
    (readProfile as any).mockResolvedValue({ xp: 175, cursor: { round: 7, day: 2 }, freezeTokens: 1, lastFreezeMilestone: 3, freezeUsedRound: null });
    const res = await GET(req("http://x/api/profile?address=0xABC"));
    expect(await res.json()).toEqual({
      profile: { freezeTokens: 1 },
    });
    expect(readProfile).toHaveBeenCalledWith("0xABC");
  });
  it("returns { profile: null } when absent", async () => {
    (readProfile as any).mockResolvedValue(null);
    const res = await GET(req("http://x/api/profile?address=0xABC"));
    expect(await res.json()).toEqual({ profile: null });
  });
  it("returns { profile: null } with 400 when address is missing", async () => {
    const res = await GET(req("http://x/api/profile"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ profile: null });
    expect(readProfile).not.toHaveBeenCalled();
  });
});
