import { describe, it, expect } from "vitest";
import { rateCapTxs } from "./rateCap";

const W = 1800; // 30 min

describe("rateCapTxs", () => {
  it("keeps a single tx", () => {
    const txs = [{ timestamp: 100 }];
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 100 }]);
  });

  it("collapses a burst inside one window to a single counted tx", () => {
    const txs = [{ timestamp: 100 }, { timestamp: 200 }, { timestamp: 900 }];
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 100 }]);
  });

  it("counts txs spaced at least one window apart", () => {
    const txs = [{ timestamp: 0 }, { timestamp: 1800 }, { timestamp: 3600 }];
    expect(rateCapTxs(txs, W)).toEqual([
      { timestamp: 0 },
      { timestamp: 1800 },
      { timestamp: 3600 },
    ]);
  });

  it("uses exactly-window boundary as counted (>=, not >)", () => {
    const txs = [{ timestamp: 0 }, { timestamp: 1799 }, { timestamp: 1800 }];
    // 1799 is inside the window (dropped); 1800 is exactly a window later (kept).
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 0 }, { timestamp: 1800 }]);
  });

  it("sorts unsorted input before capping and does not mutate the input", () => {
    const txs = [{ timestamp: 3600 }, { timestamp: 100 }, { timestamp: 200 }];
    const copy = [...txs];
    expect(rateCapTxs(txs, W)).toEqual([{ timestamp: 100 }, { timestamp: 3600 }]);
    expect(txs).toEqual(copy);
  });

  it("returns empty for empty input", () => {
    expect(rateCapTxs([], W)).toEqual([]);
  });
});
