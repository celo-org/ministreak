import { describe, it, expect, vi, afterEach } from "vitest";

// contracts.ts reads NEXT_PUBLIC_* at module-eval time, so each case stubs env
// then re-imports the module fresh.
async function loadConstants() {
  vi.resetModules();
  return import("./contracts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("network constants (env-overridable defaults)", () => {
  it("defaults to Celo mainnet when no env vars are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "");
    vi.stubEnv("NEXT_PUBLIC_CELO_RPC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_USDT_ADDRESS", "");
    const c = await loadConstants();
    expect(c.CHAIN_ID).toBe(42220);
    expect(c.CELO_RPC_URL).toBe("https://forno.celo.org");
    expect(c.USDT_ADDRESS.toLowerCase()).toBe(
      "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e".toLowerCase()
    );
  });

  it("lets an env var override the chain id (testnet/local dev)", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "11142220");
    const c = await loadConstants();
    expect(c.CHAIN_ID).toBe(11142220);
  });

  it("lets an env var override the RPC url", async () => {
    vi.stubEnv("NEXT_PUBLIC_CELO_RPC_URL", "https://example-rpc.test");
    const c = await loadConstants();
    expect(c.CELO_RPC_URL).toBe("https://example-rpc.test");
  });

  it("falls back to mainnet when chain id is non-numeric garbage", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHAIN_ID", "not-a-number");
    const c = await loadConstants();
    expect(c.CHAIN_ID).toBe(42220);
  });

  it("exposes the fixed entry fee (0.10 USDT, 6 decimals)", async () => {
    const c = await loadConstants();
    expect(c.ENTRY_FEE).toBe(100000n);
  });
});
