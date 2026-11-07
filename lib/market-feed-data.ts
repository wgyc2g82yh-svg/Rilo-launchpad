import type { Market } from "./integration-types.ts";
export const FEED_REFRESH_MS = 20_000;
export const LIVE_QUOTE_REFRESH_MS = 5_000;
export const MAX_DISCOVERY_PAGE = 10;
export function positiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string" || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
export function capitalization(cap: unknown, fdv: unknown): Pick<Market, "marketCap" | "marketCapKind"> {
  const reported = positiveNumber(cap), estimate = positiveNumber(fdv);
  return { marketCap: reported ?? estimate, marketCapKind: reported !== null ? "reported" : estimate !== null ? "fdv" : null };
}
export function mergeMarket(old: Market | undefined, market: Market): Market {
  const keepCap = old?.marketCap != null && (market.marketCap == null || !market.quotedAt && old.marketCapKind === "reported" && market.marketCapKind !== "reported");
  const updated = { ...market, imageUrl: market.imageUrl || old?.imageUrl || null,
    fallbackImageUrl: market.fallbackImageUrl || old?.fallbackImageUrl || (old?.imageUrl !== market.imageUrl ? old?.imageUrl : null) };
  const newerQuote = old?.quotedAt && (!market.quotedAt || Date.parse(old.quotedAt) > Date.parse(market.quotedAt));
  if (newerQuote) return { ...updated, marketCap: old.marketCap, marketCapKind: old.marketCapKind, quotedAt: old.quotedAt,
    ...(old.pool === market.pool ? { price: old.price, volume24h: old.volume24h, liquidity: old.liquidity, change24h: old.change24h } : {}) };
  return keepCap ? { ...updated, marketCap: old.marketCap, marketCapKind: old.marketCapKind } : updated;
}
export function mergeFeed(previous: Market[], incoming: Market[], prepend = false): Market[] {
  const prior = new Map(previous.map(market => [market.mint, market]));
  const updates = new Map(incoming.map(market => [market.mint, mergeMarket(prior.get(market.mint), market)]));
  const order = prepend ? [...incoming, ...previous] : [...previous, ...incoming];
  const seen = new Set<string>();
  return order.filter(market => { if (seen.has(market.mint)) return false; seen.add(market.mint); return true; }).map(market => updates.get(market.mint) ?? market).slice(0, 400);
}
export function applyQuotes(markets: Market[], quotes: Market[]): Market[] {
  return markets.map(market => {
    const tokenQuotes = quotes.filter(quote => quote.mint === market.mint);
    const exact = tokenQuotes.find(quote => quote.pool === market.pool);
    const cap = exact?.marketCap != null ? exact : tokenQuotes.find(quote => quote.marketCapKind === "reported") ?? tokenQuotes.find(quote => quote.marketCap != null);
    const newer = (quote: Market) => !market.quotedAt || Boolean(quote.quotedAt && Date.parse(quote.quotedAt) >= Date.parse(market.quotedAt));
    const image = (exact?.imageUrl ? exact : tokenQuotes.find(quote => quote.imageUrl))?.imageUrl;
    return { ...market,
      ...(image ? { imageUrl: market.imageUrl || image, fallbackImageUrl: image !== market.imageUrl ? image : market.fallbackImageUrl } : {}),
      ...(exact && newer(exact) ? { price: exact.price ?? market.price, volume24h: exact.volume24h ?? market.volume24h, liquidity: exact.liquidity ?? market.liquidity, change24h: exact.change24h ?? market.change24h } : {}),
      ...(cap && newer(cap) && (cap.quotedAt || cap.marketCapKind === "reported" || market.marketCapKind !== "reported") ? { marketCap: cap.marketCap, marketCapKind: cap.marketCapKind, ...(cap.quotedAt ? { quotedAt: cap.quotedAt } : {}) } : {}),
    };
  });
}

export function quoteBatch(markets: Market[], offset: number, limit = 90): { mints: string[]; nextOffset: number } {
  const mints = [...new Set(markets.map(market => market.mint))];
  if (!mints.length) return { mints: [], nextOffset: 0 };
  const start = Number.isInteger(offset) && offset >= 0 && offset < mints.length ? offset : 0;
  const end = Math.min(mints.length, start + Math.max(1, Math.min(90, limit)));
  return { mints: mints.slice(start, end), nextOffset: end >= mints.length ? 0 : end };
}

// Refresh every loaded token, including rows beyond the original 90-token batch.
export function liveQuoteBatches(markets: Market[]): string[][] {
  const mints = [...new Set(markets.map(market => market.mint))];
  const batches: string[][] = [];
  for (let offset = 0; offset < mints.length; offset += 90) batches.push(mints.slice(offset, offset + 90));
  return batches;
}
