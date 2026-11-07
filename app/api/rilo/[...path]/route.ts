import { tokenSecurity } from "@/lib/security-service";
import { NextRequest, NextResponse } from "next/server";
import { discoverMarkets, marketQuotes, tokenChart, tokenMarket } from "@/lib/market-data";
import { capacity, IntegrationError, jsonBody, publicError } from "@/lib/integration-server";
import { executeSwap, swapOrder } from "@/lib/swap-service";
import { createCurveConfig, claimPoolFees, curveSummary, poolForMint, curveSwap } from "@/lib/bonding-curve";
import { launchChallenge, prepareLaunch } from "@/lib/launch-service";
import { address, submitBuiltTransaction, transactionStatus } from "@/lib/chain-transactions";
import { analyzeWallets } from "@/lib/wallet-analysis";
import { isSolanaAddress } from "@/lib/token-analysis";
import { tokenLiquidity } from "@/lib/liquidity-service";
import { resolveArtwork } from "@/lib/token-artwork";
import { rpc } from "@/lib/solana-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
async function handle(request: NextRequest) {
  try {
    const result = await capacity(async () => {
      const path = request.nextUrl.pathname.replace(/^\/api\/rilo\//, ""), params = request.nextUrl.searchParams;
      if (request.method === "GET") {
        if (path === "status") return { market: true, trading: Boolean(process.env.APP_SIGNING_SECRET && process.env.APP_ORIGIN && process.env.SOLANA_RPC_URL && process.env.ENABLE_MAINNET_TRANSACTIONS === "true"), rpc: Boolean(process.env.SOLANA_RPC_URL), signing: Boolean(process.env.APP_SIGNING_SECRET && process.env.APP_ORIGIN), launches: Boolean(process.env.APP_SIGNING_SECRET && process.env.APP_ORIGIN && process.env.SOLANA_RPC_URL && process.env.RILO_DBC_CONFIG && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_URL), config: process.env.RILO_DBC_CONFIG || null, treasury: process.env.RILO_TREASURY_ADDRESS || null, buybackMint: process.env.RILO_TOKEN_MINT || null, mainnetEnabled: process.env.ENABLE_MAINNET_TRANSACTIONS === "true", origin: process.env.APP_ORIGIN || null };
        if (path === "discover") return discoverMarkets(params.get("mode") || "new", Number(params.get("page") || "1"), params.get("expand") === "1");
        if (path === "market/artwork") {
          const mints = [...new Set((params.get("mints") || "").split(","))];
          if (!mints.length || mints.length > 90 || !mints.every(isSolanaAddress)) throw new IntegrationError(400, "Choose between 1 and 90 valid token addresses.");
          return { artwork: await resolveArtwork(mints) };
        }
        if (path === "market/quotes") {
          const markets = await marketQuotes((params.get("mints") || "").split(","));
          const times = markets.map(market => Date.parse(market.quotedAt ?? "")).filter(Number.isFinite);
          return { markets, observedAt: times.length ? new Date(Math.min(...times)).toISOString() : new Date().toISOString(), refreshMs: 5000, source: "DexScreener indexed quotes" };
        }
        if (path === "market") return tokenMarket(address(params.get("mint")));
        if (path === "chart") return tokenChart(address(params.get("pool")), params.get("side") || "base", params.get("interval") || "5m");
        if (path === "liquidity") return tokenLiquidity(address(params.get("mint")), address(params.get("pool")));
        if (path === "order") return swapOrder(Object.fromEntries(params));
        if (path === "curve/order") return curveSwap(Object.fromEntries(params));
        if (path === "curve") return curveSummary();
        if (path === "pool") return { pool: await poolForMint(address(params.get("mint"))) };
        if (path === "security") return tokenSecurity(address(params.get("mint")), params.has("pool") ? address(params.get("pool")) : undefined);
        if (path === "wallets") return analyzeWallets(address(params.get("mint")));
        if (path === "transaction") return transactionStatus(params.get("signature") || "");
      }
      if (request.method === "POST") {
        const body = await jsonBody(request, ["launch/challenge", "launch/prepare"].includes(path) ? 2_900_000 : 30_000);
        if (path === "swap/execute") return executeSwap(body);
        if (path === "launch/challenge") return launchChallenge(body);
        if (path === "launch/prepare") return prepareLaunch(body);
        if (path === "transaction/submit") return submitBuiltTransaction(body);
        if (path === "fees/claim") return claimPoolFees(address(body.wallet), address(body.pool), String(body.role));
        if (path === "curve/prepare") return createCurveConfig(body);
        if (path === "buyback/order") {
          const treasury = process.env.RILO_TREASURY_ADDRESS, mint = process.env.RILO_TOKEN_MINT;
          if (!treasury || !mint || !isSolanaAddress(mint)) throw new IntegrationError(503, "The buyback treasury and RILO token mint must be configured.");
          if (address(body.wallet) !== treasury) throw new IntegrationError(403, "Connect the treasury wallet for a buyback.");
          const supply = await rpc<{ value: { decimals: number } }>("getTokenSupply", [mint, { commitment: "confirmed" }]);
          const order = await swapOrder({ inputMint: "So11111111111111111111111111111111111111112", outputMint: mint, amount: body.amount, wallet: treasury, slippageBps: body.slippageBps });
          return { ...order, outputDecimals: supply.value.decimals };
        }
      }
      throw new IntegrationError(404, "Endpoint not found.");
    });
    return NextResponse.json(result, { headers });
  } catch (error) { const failure = publicError(error); return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { ...headers, ...(failure.status === 429 ? { "Retry-After": String(Math.ceil((error instanceof IntegrationError ? error.retryAfterMs ?? 10_000 : 10_000) / 1000)) } : {}) } }); }
}
export const GET = handle;
export const POST = handle;
