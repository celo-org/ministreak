import { describe, it, expect } from "vitest";
import { pseudonymFor, shortAddress } from "./pseudonym";

describe("pseudonymFor", () => {
  const addr = "0xcd125da0EC85c8414D39fa94011b607C2A5f17e5";

  it("is deterministic for the same address", () => {
    expect(pseudonymFor(addr)).toBe(pseudonymFor(addr));
  });

  it("is case-insensitive (same alias regardless of checksum casing)", () => {
    expect(pseudonymFor(addr)).toBe(pseudonymFor(addr.toLowerCase()));
    expect(pseudonymFor(addr)).toBe(pseudonymFor(addr.toUpperCase()));
  });

  it("returns the Adjective+Noun-XXXX shape", () => {
    expect(pseudonymFor(addr)).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+-[0-9A-F]{4}$/);
  });

  it("returns Anonymous for empty/undefined/null", () => {
    expect(pseudonymFor(undefined)).toBe("Anonymous");
    expect(pseudonymFor(null)).toBe("Anonymous");
    expect(pseudonymFor("")).toBe("Anonymous");
  });

  it("produces different aliases for different addresses", () => {
    const a = pseudonymFor("0x0000000000000000000000000000000000000001");
    const b = pseudonymFor("0x0000000000000000000000000000000000000002");
    expect(a).not.toBe(b);
  });
});

describe("shortAddress", () => {
  it("truncates to first 6 and last 4 with an ellipsis", () => {
    expect(shortAddress("0xcd125da0EC85c8414D39fa94011b607C2A5f17e5")).toBe(
      "0xcd12…17e5"
    );
  });
});
