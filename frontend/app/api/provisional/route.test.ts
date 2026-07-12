import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/oracle/provisionalStore", () => ({
  readProvisional: vi.fn(),
}));

import { GET } from "./route";
import { readProvisional } from "@/lib/oracle/provisionalStore";

function req(url: string) {
  return new Request(url) as any;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/provisional", () => {
  it("returns the snapshot for a roundId", async () => {
    const snap = { roundId: "7", dayIndex: 1, updatedAt: 1, players: {} };
    (readProvisional as any).mockResolvedValue(snap);
    const res = await GET(req("http://x/api/provisional?roundId=7"));
    expect(await res.json()).toEqual({ snapshot: snap });
    expect(readProvisional).toHaveBeenCalledWith("7");
  });

  it("returns { snapshot: null } when absent", async () => {
    (readProvisional as any).mockResolvedValue(null);
    const res = await GET(req("http://x/api/provisional?roundId=9"));
    expect(await res.json()).toEqual({ snapshot: null });
  });

  it("returns { snapshot: null } with 400 when roundId is missing", async () => {
    const res = await GET(req("http://x/api/provisional"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ snapshot: null });
    expect(readProvisional).not.toHaveBeenCalled();
  });
});
