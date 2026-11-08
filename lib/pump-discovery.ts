import "server-only";
import { PublicKey } from "@solana/web3.js";
import { unstable_cache } from "next/cache";
import { cached, fetchProvider, IntegrationError } from "@/lib/integration-server";
import { rpc } from "@/lib/solana-rpc";
import { PUMP_PROGRAM, pumpInitialReserves, pumpCurveProgress } from "@/lib/pump-curve-state";
import { isSolanaAddress } from "@/lib/token-analysis";
import { capitalization, FEED_REFRESH_MS, MAX_DISCOVERY_PAGE } from "@/lib/market-feed-data";
import { rankDiscovery } from "@/lib/discovery-policy";
import { tokenImageUrl } from "@/lib/token-image";
import type { Market, MarketResponse } from "@/lib/integration-types";
const program = new PublicKey(PUMP_PROGRAM);
const globalAddress = PublicKey.findProgramAddressSync([Buffer.from("global")], program)[0].toBase58();
type RpcAccounts = { value: ({ owner: string; data: [string, string] } | null)[] };
// Candidate metadata is untrusted. Only derived PDAs owned by Pump, decoded
// from the configured RPC, can establish the stage and graduation percentage.
export async function pumpBondingMarkets(page: number): Promise<MarketResponse> {
  const load = async () => {
    const root = (process.env.PUMP_API_URL || "https://frontend-api-v3.pump.fun").replace(/\/$/, "");
    const sources = await Promise.allSettled(["market_cap", "last_trade_timestamp"].map(sort =>
      fetchProvider(`${root}/coins?offset=${(page - 1) * 50}&limit=50&sort=${sort}&order=DESC&includeNsfw=false&complete=false`, undefined, 4000)));
    const lists = sources.flatMap(result => result.status === "fulfilled" && Array.isArray(result.value) ? [result.value] : []);
    if (!lists.length) throw new IntegrationError(502, "Launchpad candidates are temporarily unavailable.");
    const coins = [...new Map(lists.flat().filter(coin => coin && isSolanaAddress(coin.mint) && coin.complete === false).map(coin => [coin.mint, coin])).values()].slice(0, 100);
    const config = await cached("pump-global-reserves-v1", 60_000, async () => {
      const result = await rpc<RpcAccounts>("getMultipleAccounts", [[globalAddress], { encoding: "base64", commitment: "confirmed" }]);
      const reserves = pumpInitialReserves(result.value?.[0] ?? null);
      if (!reserves) throw new IntegrationError(502, "Launchpad curve parameters could not be verified.");
      return reserves;
    });
    const curves = coins.map(coin => PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(coin.mint).toBuffer()], program)[0].toBase58());
    const accounts = curves.length ? await rpc<RpcAccounts>("getMultipleAccounts", [curves, { encoding: "base64", commitment: "confirmed" }]) : { value: [] };
    if (!Array.isArray(accounts.value) || accounts.value.length !== coins.length) throw new IntegrationError(502, "Launchpad curve states could not be verified.");
    const candidates: Market[] = coins.flatMap((coin, index) => {
      const progress = pumpCurveProgress(accounts.value[index], config);
      if (progress === null) return [];
      const cap = Number(coin.usd_market_cap), supply = Number(config.supply) / 1e6;
      const fdv = Number.isFinite(cap) && cap > 0 ? cap : null;
      const created = Number(coin.created_timestamp);
      const createdAt = Number.isFinite(created) && created > 0 && created <= Date.now() ? new Date(created).toISOString() : null;
      return [{ mint: coin.mint, pool: curves[index], name: String(coin.name || "Token").slice(0, 100), symbol: String(coin.symbol || "TOKEN").slice(0, 20), imageUrl: tokenImageUrl(coin.image_uri), ...capitalization(null, fdv), price: fdv === null ? null : fdv / supply, volume24h: null, liquidity: null, change24h: null, createdAt, launchCreatedAt: createdAt, decimals: 6, dex: "pump-fun", tokenSide: "base", launchStage: "bonding", graduationProgress: progress } satisfies Market];
    });
    const markets = rankDiscovery(candidates, "bonding");
    const allowed = new Set(markets.map(market => market.mint));
    return { markets, observedAt: new Date().toISOString(), page, nextPage: lists.some(list => list.length >= 50) && page < MAX_DISCOVERY_PAGE ? page + 1 : null, refreshMs: FEED_REFRESH_MS, expanded: true, expandable: false, partial: lists.length < sources.length, excludedMints: coins.filter(coin => !allowed.has(coin.mint)).map(coin => coin.mint), source: "Pump.fun · RPC-verified curve reserves · DexScreener quotes" };
  };
  const fresh = () => cached(`pump-bonding-v1:${page}`, FEED_REFRESH_MS, load);
  if (process.env.PUMP_API_URL) return fresh();
  const shared = unstable_cache(fresh, ["pump-bonding-v1", String(page)], { revalidate: FEED_REFRESH_MS / 1000 });
  const result = await shared();
  return Date.now() - Date.parse(result.observedAt) >= FEED_REFRESH_MS ? fresh() : result;
}
