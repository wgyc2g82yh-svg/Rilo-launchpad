import "server-only";
import { launchStage } from "@/lib/launch-stage";
import { rugcheckReport } from "@/lib/rugcheck-service";
import { tokenImageUrl } from "@/lib/token-image";
import { CHART_INTERVALS, isChartInterval } from "@/lib/chart-options";
import { isSolanaAddress } from "@/lib/token-analysis";
import { normalizeCandles } from "@/lib/integration-types";
import type { Market, MarketResponse } from "@/lib/integration-types";
import { cached, fetchProvider, IntegrationError } from "@/lib/integration-server";

const root = () => (process.env.GECKO_API_URL || "https://api.geckoterminal.com/api/v2").replace(/\/$/, "");
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
type Resource = { id: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } }> };
function parseMarkets(value: unknown, mint?: string): Market[] {
  const payload = value as { data?: Resource[]; included?: Resource[] };
  if (!Array.isArray(payload?.data)) throw new IntegrationError(502, "Market data is unavailable.");
  const included = new Map((payload.included ?? []).map(item => [item.id, item.attributes ?? {}]));
  return payload.data.flatMap(item => {
    const a = item.attributes ?? {};
    const baseId = item.relationships?.base_token?.data?.id ?? "";
    const quoteId = item.relationships?.quote_token?.data?.id ?? "";
    const tokenSide = mint && quoteId === `solana_${mint}` ? "quote" : "base";
    const tokenId = tokenSide === "base" ? baseId : quoteId;
    const address = tokenId.replace(/^solana_/, "");
    if (!isSolanaAddress(String(a.address)) || !isSolanaAddress(address) || mint && address !== mint) return [];
    const token = included.get(tokenId) ?? {};
    const volume = a.volume_usd as Record<string, unknown> | undefined;
    const change = a.price_change_percentage as Record<string, unknown> | undefined;
    return [{ marketCap: tokenSide === "base" ? num(a.market_cap_usd) : null, pool: String(a.address), mint: address, name: String(token.name || a.name || "Token").slice(0, 100), symbol: String(token.symbol || String(a.name || "TOKEN").split(" / ")[tokenSide === "base" ? 0 : 1] || "TOKEN").slice(0, 20), imageUrl: tokenImageUrl(token.image_url), price: num(a[`${tokenSide}_token_price_usd`]), volume24h: num(volume?.h24), liquidity: num(a.reserve_in_usd), change24h: tokenSide === "base" ? num(change?.h24) : null, createdAt: typeof a.pool_created_at === "string" ? a.pool_created_at : null, decimals: Number.isInteger(token.decimals) ? Number(token.decimals) : null, dex: String(item.relationships?.dex?.data?.id || "DEX").slice(0, 50), tokenSide } satisfies Market];
  });
}
async function indexedMarkets(mode: "new" | "trending"): Promise<Market[]> {
  return cached(`indexed-markets:${mode}`, 90_000, async () => parseMarkets(await fetchProvider(`${root()}/networks/solana/${mode === "new" ? "new_pools" : "trending_pools"}?include=base_token,quote_token,dex&page=1`)));
}
async function launchMarkets() {
  return cached("launch-markets", 90_000, async () => {
    // Bound provider calls: scan recent and active pools, then fetch token-level migration evidence.
    const candidates = (await Promise.all([indexedMarkets("new"), indexedMarkets("trending")])).flat();
    const mints = [...new Set(candidates.map(market => market.mint))].slice(0, 40);
    const details = new Map<string, ReturnType<typeof launchStage>>();
    for (let offset = 0; offset < mints.length; offset += 30) {
      const payload = await fetchProvider(`${root()}/networks/solana/tokens/multi/${mints.slice(offset, offset + 30).join(",")}`) as { data?: Resource[] };
      if (!Array.isArray(payload?.data)) throw new IntegrationError(502, "Launch status data is unavailable.");
      for (const token of payload.data) details.set(token.id.replace(/^solana_/, ""), launchStage(token.attributes?.launchpad_details));
    }
    const bonding: Market[] = [], graduated: Market[] = [];
    const destinations = [...new Set([...details.values()].filter(detail => detail.stage === "graduated" && isSolanaAddress(detail.destination ?? "")).map(detail => detail.destination!))];
    const migrated: Market[] = [];
    for (let offset = 0; offset < destinations.length; offset += 30) {
      migrated.push(...parseMarkets(await fetchProvider(`${root()}/networks/solana/pools/multi/${destinations.slice(offset, offset + 30).join(",")}?include=base_token,quote_token,dex`)));
    }
    const seen = new Set<string>();
    for (const market of candidates) {
      if (seen.has(market.mint)) continue;
      const status = details.get(market.mint);
      if (status?.stage === "bonding") { bonding.push(market); seen.add(market.mint); }
      if (status?.stage === "graduated") {
        // Use the destination's live metrics and pool for the terminal, never the retired curve.
        const destination = migrated.find(item => item.mint === market.mint && item.pool === status.destination);
        if (destination) { graduated.push(destination); seen.add(market.mint); }
      }
    }
    return { bonding, graduated, observedAt: new Date().toISOString() };
  });
}
export async function discoverMarkets(mode: string): Promise<MarketResponse> {
  if (!["trending", "new", "bonding", "graduated"].includes(mode)) throw new IntegrationError(400, "Choose new, bonding, or graduated pools.");
  if (mode === "bonding" || mode === "graduated") {
    const launches = await launchMarkets();
    return { markets: launches[mode], observedAt: launches.observedAt, source: "GeckoTerminal · recent and active indexed sample · reported launch status" };
  }
  return { markets: await indexedMarkets(mode as "new" | "trending"), observedAt: new Date().toISOString(), source: "GeckoTerminal · indexed Solana pools" };
}
export async function tokenMarket(mint: string): Promise<MarketResponse> {
  if (!isSolanaAddress(mint)) throw new IntegrationError(400, "Invalid token address.");
  return cached(`token-market:${mint}`, 60_000, async () => {
    const [pools, holders, pairs] = await Promise.all([
      fetchProvider(`${root()}/networks/solana/tokens/${mint}/pools?include=base_token,quote_token,dex`),
      rugcheckReport(mint).catch(() => null),
      fetchProvider(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`).catch(() => null),
    ]);
    const report = holders?.report as { mint?: string; totalHolders?: number } | undefined;
    const count = report?.mint === mint ? report.totalHolders : undefined;
    const totalHolders = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
    const markets = parseMarkets(pools, mint).sort((a,b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
    const marketCap = Array.isArray(pairs) ? pairs.find(pair => pair?.baseToken?.address === mint && (num(pair.marketCap) ?? 0) > 0)?.marketCap : null;
    return { markets: markets.map(market => ({ ...market, marketCap: market.marketCap ?? num(marketCap) })), totalHolders, observedAt: new Date().toISOString(), source: "GeckoTerminal · DexScreener · RugCheck" };
  });
}
export async function tokenChart(pool: string, side: string, interval = "5m") {
  if (!isSolanaAddress(pool) || !["base", "quote"].includes(side) || !isChartInterval(interval)) throw new IntegrationError(400, "Choose a valid pool, token side, and chart interval (live, 5m, or 4h).");
  const options = CHART_INTERVALS[interval];
  return cached(`chart:${pool}:${side}:${interval}`, options.cacheMs, async () => {
    const payload = await fetchProvider(`${root()}/networks/solana/pools/${pool}/ohlcv/${options.timeframe}?aggregate=${options.aggregate}&limit=120&currency=usd&token=${side}`) as { data?: { attributes?: { ohlcv_list?: unknown } } };
    return { candles: normalizeCandles(payload?.data?.attributes?.ohlcv_list), interval, observedAt: new Date().toISOString(), source: "GeckoTerminal", refreshMs: options.refreshMs };
  });
}
