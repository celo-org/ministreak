import { describe, it, expect } from "vitest";
import { hasOutgoingToday } from "./todayActivity";
import { DAY } from "./roundDay";

const player = "0x1111111111111111111111111111111111111111";
const start = 1_000_000;

describe("hasOutgoingToday", () => {
  it("is true for an outgoing tx to another address today", () => {
    const txs = [{ to: "0xABC0000000000000000000000000000000000000", timestamp: start + 5 }];
    expect(hasOutgoingToday(txs, start, player)).toBe(true);
  });

  it("ignores self-sends", () => {
    const txs = [{ to: player, timestamp: start + 5 }];
    expect(hasOutgoingToday(txs, start, player)).toBe(false);
  });

  it("ignores null recipients", () => {
    expect(hasOutgoingToday([{ to: null, timestamp: start + 5 }], start, player)).toBe(false);
  });

  it("ignores txs outside today's window", () => {
    const txs = [
      { to: "0xABC0000000000000000000000000000000000000", timestamp: start - 5 },
      { to: "0xABC0000000000000000000000000000000000000", timestamp: start + DAY + 5 },
    ];
    expect(hasOutgoingToday(txs, start, player)).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(hasOutgoingToday([], start, player)).toBe(false);
  });
});
