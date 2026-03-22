import { NextResponse } from "next/server";

export async function GET() {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_CELO_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";
    const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS;
    
    // Test RPC connectivity
    const blockResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });
    const blockData = await blockResponse.json();
    
    // Test contract call
    let contractResult = null;
    if (vaultAddress) {
      const callResponse = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_call",
          params: [{
            to: vaultAddress,
            data: "0x5727e25d" // getCurrentRoundId()
          }, "latest"],
          id: 1,
        }),
      });
      contractResult = await callResponse.json();
    }
    
    return NextResponse.json({
      rpcUrl,
      vaultAddress,
      blockNumber: blockData.result,
      contractCall: contractResult,
      env: {
        chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
