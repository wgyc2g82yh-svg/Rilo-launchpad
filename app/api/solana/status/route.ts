import { NextResponse } from "next/server";
import { rpc, RpcError } from "@/lib/solana-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const genesisHash = await rpc<string>("getGenesisHash");
    return NextResponse.json({ configured: true, connected: true, genesisHash }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ configured: Boolean(process.env.SOLANA_RPC_URL), connected: false, error: error instanceof RpcError ? error.message : "Connection unavailable." }, { status: error instanceof RpcError ? error.status : 502, headers: { "Cache-Control": "no-store" } });
  }
}
