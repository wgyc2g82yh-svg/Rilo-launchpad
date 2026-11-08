import "server-only";
import { pumpBondingMarkets } from "@/lib/pump-discovery";
import { enrichArtwork } from "@/lib/token-artwork";
import { unstable_cache } from "next/cache";
import { capitalization, applyQuotes, FEED_REFRESH_MS, LIVE_QUOTE_REFRESH_MS, MAX_DISCOVERY_PAGE } from "@/lib/market-feed-data";
import { rankDiscovery, eligibleDiscovery, LAUNCH_CURVE_DEXES, type DiscoveryMode } from "@/lib/discovery-policy";
import { launchStage } from "@/lib/launch-stage";
import { rugcheckReport } from "@/lib/rugcheck-service";
import { tokenImageUrl } from "@/lib/token-image";
import { CHART_INTERVALS, isChartInterval } from "@/lib/chart-options";
import { isSolanaAddress } from "@/lib/token-analysis";
import { normalizeCandles } from "@/lib/integration-types";
import type { Market, MarketResponse } from "@/lib/integration-types";
import { cached, fetchProvider, IntegrationError } from "@/lib/integration-server";
import { RpcError } from "@/lib/solana-rpc";
import { createReadSnapshots } from "@/lib/read-snapshot";

const snapshots = createReadSnapshots();
async function marketSnapshot(key: string, ttl: number, load: () => Promise<MarketResponse>, discovery = false): Promise<MarketResponse> {
  const freshLoad = () => cached(`market-refresh:${key}`, ttl, load);
  const shared = process.env.GECKO_API_URL || discovery ? freshLoad : unstable_cache(freshLoad, ["market-snapshot-v4", key], { revalidate: Math.ceil(ttl / 1000) });
  // A long-idle Next cache can return its old value once while revalidating.
  // Refresh that value before putting it in the per-instance fresh cache.
  const sharedLoad = async () => {
    const value = await shared();
    const age = Date.now() - Date.parse(value.observedAt);
    return age > ttl ? freshLoad() : value;
  };
  const result = await snapshots.read(key, ttl, sharedLoad);
  const age = Date.now() - Date.parse(result.value.observedAt);
  if (!Number.isFinite(age) || age > 300_000) throw new IntegrationError(502, "Market data is temporarily unavailable. Refreshing automatically.");
  return { ...result.value, stale: result.stale || Boolean(result.value.stale) || age > (discovery ? Math.max(60_000, ttl * 2) : ttl * 2) };
}

const root = () => (process.env.GECKO_API_URL || "https://api.geckoterminal.com/api/v2").replace(/\/$/, "");
let providerRetryAt = 0;
let providerFailure: unknown;
type ProviderObservation = { receivedAt: number };
async function marketProvider(url: string, observation?: ProviderObservation): Promise<unknown> {
  // Share public discovery responses across serverless instances, including across tabs.
  // Keep test providers uncached by Next so fixtures remain isolated.
  if (process.env.GECKO_API_URL) {
    const value = await fetchProvider(url);
    if (observation) observation.receivedAt = Math.min(observation.receivedAt, Date.now());
    return value;
  }
  const load = () => cached(`discovery-provider-v5:${url}`, FEED_REFRESH_MS, async () => {
    if (Date.now() < providerRetryAt) throw providerFailure;
    try { return { value: await fetchProvider(url, undefined, 5_000), receivedAt: Date.now() }; }
    catch (error) {
      if (error instanceof IntegrationError && error.status === 429) { providerRetryAt = Date.now() + (error.retryAfterMs ?? 60_000); providerFailure = error; }
      throw error;
    }
  });
  const shared = unstable_cache(load, ["discovery-provider-v5", url], { revalidate: FEED_REFRESH_MS / 1000 });
  const result = await shared();
  // Next starts one shared revalidation. Starting another synchronous load here
  // doubles upstream traffic and can keep a healthy feed in a rate-limit loop.
  if (Date.now() - result.receivedAt > 300_000) throw new IntegrationError(502, "The launch index has not refreshed. Retrying automatically.");
  if (observation) observation.receivedAt = Math.min(observation.receivedAt, result.receivedAt);
  return result.value;
}
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
    return [{ ...capitalization(tokenSide === "base" ? a.market_cap_usd : null, tokenSide === "base" ? a.fdv_usd : null), pool: String(a.address), mint: address, name: String(token.name || a.name || "Token").slice(0, 100), symbol: String(token.symbol || String(a.name || "TOKEN").split(" / ")[tokenSide === "base" ? 0 : 1] || "TOKEN").slice(0, 20), imageUrl: tokenImageUrl(token.image_url), price: num(a[`${tokenSide}_token_price_usd`]), volume24h: num(volume?.h24), liquidity: num(a.reserve_in_usd), change24h: tokenSide === "base" ? num(change?.h24) : null, createdAt: typeof a.pool_created_at === "string" ? a.pool_created_at : null, decimals: Number.isInteger(token.decimals) ? Number(token.decimals) : null, dex: String(item.relationships?.dex?.data?.id || "DEX").slice(0, 50), tokenSide } satisfies Market];
  });
}
async function indexedMarkets(mode: "new" | "trending", page = 1, observation?: ProviderObservation): Promise<Market[]> {
  return parseMarkets(await marketProvider(`${root()}/networks/solana/${mode === "new" ? "new_pools" : "trending_pools"}?include=base_token,quote_token,dex&page=${page}`, observation));
}
async function launchMarkets(page: number, mode: DiscoveryMode, expanded: boolean) {
  const load = async () => {
    const observation = { receivedAt: Number.POSITIVE_INFINITY };
    const provider = (url: string) => marketProvider(url, observation);
    // Bound provider calls: scan recent and active pools, then fetch token-level migration evidence.
    const curve = () => provider(`${root()}/networks/solana/dexes/pump-fun/pools?include=base_token,quote_token,dex&page=${page}`).then(value => parseMarkets(value));
    // First paint needs one relevant candidate source and its stage proof only.
    // Broader coverage is a separate request, never a barrier to initial rows.
    const sources = await Promise.allSettled(expanded ? [indexedMarkets("new", page, observation), indexedMarkets("trending", page, observation), curve()] : [mode === "bonding" ? curve() : indexedMarkets("new", page, observation)]);
    const available = sources.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    if (!available.length) throw (sources[0] as PromiseRejectedResult).reason;
    let candidates = available.flat();
    const mints = [...new Set(candidates.map(market => market.mint))].sort();
    const details = new Map<string, ReturnType<typeof launchStage>>();
    const tokenCaps = new Map<string, ReturnType<typeof capitalization>>();
    let statusBatches = 0, statusError: unknown;
    await Promise.all(Array.from({ length: Math.ceil(mints.length / 30) }, async (_, index) => {
      const offset = index * 30;
      try {
        const payload = await provider(`${root()}/networks/solana/tokens/multi/${mints.slice(offset, offset + 30).join(",")}`) as { data?: Resource[] };
        if (!Array.isArray(payload?.data)) throw new IntegrationError(502, "Launch status data is unavailable.");
        statusBatches++;
        for (const token of payload.data) {
          const mint = token.id.replace(/^solana_/, "");
          if (!mints.includes(mint)) continue;
          details.set(mint, launchStage(token.attributes?.launchpad_details));
          tokenCaps.set(mint, capitalization(token.attributes?.market_cap_usd, token.attributes?.fdv_usd));
        }
      } catch (error) { statusError = error; }
    }));
    if (mints.length && !statusBatches) throw statusError;
    candidates = candidates.map(market => {
      const cap = tokenCaps.get(market.mint);
      return cap?.marketCap != null && (cap.marketCapKind === "reported" || market.marketCap == null) ? { ...market, ...cap } : market;
    });
    const fresh: Market[] = [], bonding: Market[] = [], graduated: Market[] = [];
    const destinations = [...new Set([...details.values()].filter(detail => detail.stage === "graduated" && isSolanaAddress(detail.destination ?? "")).map(detail => detail.destination!))];
    const migrated: Market[] = candidates.filter(market => destinations.includes(market.pool));
    const missing = destinations.filter(pool => !migrated.some(market => market.pool === pool));
    for (let offset = 0; expanded && mode === "graduated" && offset < missing.length; offset += 30) {
      // Extra pool metrics must not take down otherwise verified launch-stage results.
      const payload = await provider(`${root()}/networks/solana/pools/multi/${missing.slice(offset, offset + 30).join(",")}?include=base_token,quote_token,dex`).catch(() => ({ data: [] }));
      migrated.push(...parseMarkets(payload));
    }
    // Prefer the original curve over a secondary pool; never reset launch age on a relisting.
    candidates.sort((a, b) => Number(LAUNCH_CURVE_DEXES.has(b.dex)) - Number(LAUNCH_CURVE_DEXES.has(a.dex)) || (Date.parse(a.createdAt ?? "") || 0) - (Date.parse(b.createdAt ?? "") || 0));
    const seen = new Set<string>();
    for (const market of candidates) {
      if (seen.has(market.mint)) continue;
      const status = details.get(market.mint);
      if (status?.stage === "bonding") {
        const candidate = { ...market, launchStage: status.stage, graduationProgress: status.progress, launchCreatedAt: market.createdAt };
        if (eligibleDiscovery(candidate, "new")) fresh.push(candidate);
        if (eligibleDiscovery(candidate, "bonding")) bonding.push(candidate);
        seen.add(market.mint);
      }
      if (status?.stage === "graduated") {
        // Use the destination's live metrics and pool for the terminal, never the retired curve.
        const destination = migrated.find(item => item.mint === market.mint && item.pool === status.destination);
        if (isSolanaAddress(status.destination ?? "")) {
          const metrics = destination ?? { ...market, ...capitalization(null, null), pool: status.destination!, price: null, volume24h: null, liquidity: null, change24h: null };
          const cap = tokenCaps.get(market.mint);
          graduated.push({ ...metrics,
            ...(cap?.marketCap != null && (metrics.marketCap == null || cap.marketCapKind === "reported") ? cap : {}),
            imageUrl: metrics.imageUrl || market.imageUrl,
            launchStage: status.stage, graduationProgress: 100, launchCreatedAt: market.createdAt, graduatedAt: status.completedAt });
          seen.add(market.mint);
        }
      }
    }
    return { new: rankDiscovery(fresh, "new"), bonding: rankDiscovery(bonding, "bonding"), graduated: rankDiscovery(graduated, "graduated"), stages: [...details.entries()], hasMore: available.some(markets => markets.length >= 20), partial: available.length < sources.length || statusBatches < Math.ceil(mints.length / 30), observedAt: new Date(observation.receivedAt).toISOString() };
  };
  // Provider responses are the only shared revalidation layer. Replaying a
  // second shared classified snapshot compounds staleness and provider retries.
  const ttl = expanded || page > 1 ? 60_000 : FEED_REFRESH_MS;
  const group = expanded ? mode === "graduated" ? "all-graduated" : "all" : mode === "bonding" ? "curves" : "new";
  return cached(`launch-markets-v8:${group}:${page}`, ttl, load);
}
export async function marketQuotes(mints: string[]): Promise<Market[]> {
  if (!mints.length || mints.length > 90 || !mints.every(isSolanaAddress)) throw new IntegrationError(400, "Choose between 1 and 90 valid token addresses.");
  if (mints.length > 30) return (await Promise.all([0, 30, 60].map(offset => mints.slice(offset, offset + 30)).filter(batch => batch.length).map(batch => marketQuotes(batch)))).flat();
  const addresses = [...new Set(mints)].sort();
  const load = async () => {
    const payload = await fetchProvider(`${(process.env.DEXSCREENER_API_URL || "https://api.dexscreener.com").replace(/\/$/, "")}/tokens/v1/solana/${addresses.join(",")}`);
    if (!Array.isArray(payload)) throw new IntegrationError(502, "Market quotes are unavailable.");
    const quotedAt = new Date().toISOString();
    return payload.flatMap(pair => {
      if (pair?.chainId !== "solana" || !addresses.includes(pair.baseToken?.address) || !isSolanaAddress(pair.pairAddress)) return [];
      return [{ quotedAt, ...capitalization(pair.marketCap, pair.fdv), pool: pair.pairAddress, mint: pair.baseToken.address, name: String(pair.baseToken.name || "Token"), symbol: String(pair.baseToken.symbol || "TOKEN"), imageUrl: tokenImageUrl(pair.info?.imageUrl), price: num(pair.priceUsd), volume24h: num(pair.volume?.h24), liquidity: num(pair.liquidity?.usd), change24h: num(pair.priceChange?.h24), createdAt: null, decimals: null, dex: String(pair.dexId || "DEX"), tokenSide: "base" as const }];
    }).sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
  };
  const freshLoad = () => cached(`quote-provider-live:${addresses.join(",")}`, LIVE_QUOTE_REFRESH_MS, load);
  if (process.env.DEXSCREENER_API_URL) return freshLoad();
  const shared = unstable_cache(async () => {
    const markets = await freshLoad();
    return { markets, observedAt: markets[0]?.quotedAt ? Date.parse(markets[0].quotedAt) : Date.now() };
  }, ["market-quotes-v3", addresses.join(",")], { revalidate: LIVE_QUOTE_REFRESH_MS / 1000 });
  const value = await shared();
  // Reject an expired stale-while-revalidate response before it reaches the ticker.
  return Date.now() - value.observedAt >= LIVE_QUOTE_REFRESH_MS ? freshLoad() : value.markets;
}
async function enrichCaps(markets: Market[]) {
  const mints = [...new Set(markets.filter(market => (market.marketCapKind !== "reported" || !market.imageUrl)).map(market => market.mint))];
  const quotes: Market[] = [];
  for (let offset = 0; offset < mints.length; offset += 30) quotes.push(...await marketQuotes(mints.slice(offset, offset + 30)).catch(() => []));
  return enrichArtwork(applyQuotes(markets, quotes));
}
export async function discoverMarkets(mode: string, page = 1, expanded = false): Promise<MarketResponse> {
  if (!["trending", "new", "bonding", "graduated"].includes(mode)) throw new IntegrationError(400, "Choose new, bonding, or graduated pools.");
  if (!Number.isInteger(page) || page < 1 || page > MAX_DISCOVERY_PAGE) throw new IntegrationError(400, "Choose a page between 1 and 10.");
  const response = await marketSnapshot(`discover-fast-v7:${mode}:${expanded}:${page}`, expanded || page > 1 ? 60_000 : FEED_REFRESH_MS, async () => {
    let coverageNote: string | undefined;
    if (mode === "bonding" && process.env.SOLANA_RPC_URL) {
      try { return await pumpBondingMarkets(page, async () => {
        // Direct metadata may be unavailable from the hosting region. Verify
        // indexed candidates on-chain without a second, incomplete status API.
        const pages = [page * 2 - 1, page * 2].filter(number => number <= MAX_DISCOVERY_PAGE);
        const sources = await Promise.allSettled(pages.map(number => marketProvider(`${root()}/networks/solana/dexes/pump-fun/pools?include=base_token,quote_token,dex&page=${number}`).then(value => parseMarkets(value))));
        const available = sources.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
        if (!available.length) throw new IntegrationError(502, "Launchpad candidates are temporarily unavailable.");
        return { markets: available.flat(), partial: available.length < sources.length, hasMore: available.some(markets => markets.length >= 20) };
      }); }
      catch (error) {
        coverageNote = error instanceof IntegrationError || error instanceof RpcError ? `Direct curve scan delayed: ${error.message} Using independently indexed stages.` : "Direct curve scan delayed. Using independently indexed stages.";
      }
    }
    if (mode !== "trending") {
      const launches = await launchMarkets(page, mode as DiscoveryMode, expanded), selected = launches[mode as DiscoveryMode];
      const allowed = new Set(selected.map(market => market.mint));
      return { markets: selected, expanded, expandable: !expanded, coverageNote, partial: launches.partial || Boolean(coverageNote), observedAt: launches.observedAt, page,
        excludedMints: launches.stages.filter(([mint]) => !allowed.has(mint)).map(([mint]) => mint),
        nextPage: launches.hasMore && page < MAX_DISCOVERY_PAGE ? page + 1 : null, refreshMs: expanded || page > 1 ? 60_000 : FEED_REFRESH_MS, source: "GeckoTerminal · DexScreener · verified launch stages" };
    }
    const markets = await indexedMarkets("trending", page);
    return { markets: await enrichCaps(markets), observedAt: new Date().toISOString(), page, nextPage: markets.length >= 20 && page < MAX_DISCOVERY_PAGE ? page + 1 : null, refreshMs: FEED_REFRESH_MS, source: "GeckoTerminal · DexScreener · indexed Solana pools" };
  }, mode !== "trending");
  // A cached response must not keep an expired launch in the fresh-token view.
  return mode === "trending" ? response : { ...response, markets: rankDiscovery(response.markets, mode as DiscoveryMode) };
}

export async function tokenMarket(mint: string): Promise<MarketResponse> {
  if (!isSolanaAddress(mint)) throw new IntegrationError(400, "Invalid token address.");
  return marketSnapshot(`token-market:${mint}`, 30_000, async () => {
    // Token openings use the higher-capacity quote source first. Only ask the
    // constrained discovery provider when it cannot supply an indexed pool.
    const holdersResult = rugcheckReport(mint).catch(() => null);
    const pairs = await marketQuotes([mint]).catch(() => null);
    const pools = pairs?.length ? null : await marketProvider(`${root()}/networks/solana/tokens/${mint}/pools?include=base_token,quote_token,dex`).then(value => parseMarkets(value, mint)).catch(() => null);
    const holders = await holdersResult;
    const report = holders?.report as { mint?: string; totalHolders?: number } | undefined;
    const count = report?.mint === mint ? report.totalHolders : undefined;
    const totalHolders = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null;
    if (pools === null && pairs === null) throw new IntegrationError(502, "Market providers are temporarily unavailable. Try again shortly.");
    const markets = (await enrichArtwork(applyQuotes(pools?.length ? pools : pairs ?? [], pairs ?? []))).sort((a,b) => (b.liquidity ?? 0) - (a.liquidity ?? 0));
    return { markets, refreshMs: 30_000, partial: !pairs?.length && (pools === null || pairs === null), totalHolders, observedAt: new Date().toISOString(), source: pairs?.length ? "DexScreener · RugCheck" : "GeckoTerminal · RugCheck" };
  });
}
export async function tokenChart(pool: string, side: string, interval = "5m") {
  if (!isSolanaAddress(pool) || !["base", "quote"].includes(side) || !isChartInterval(interval)) throw new IntegrationError(400, "Choose a valid pool, token side, and chart interval (live, 5m, or 4h).");
  const options = CHART_INTERVALS[interval];
  return cached(`chart:${pool}:${side}:${interval}`, options.cacheMs, async () => {
    const payload = await marketProvider(`${root()}/networks/solana/pools/${pool}/ohlcv/${options.timeframe}?aggregate=${options.aggregate}&limit=120&currency=usd&token=${side}`) as { data?: { attributes?: { ohlcv_list?: unknown } } };
    return { candles: normalizeCandles(payload?.data?.attributes?.ohlcv_list), interval, observedAt: new Date().toISOString(), source: "GeckoTerminal", refreshMs: options.refreshMs };
  });
}
