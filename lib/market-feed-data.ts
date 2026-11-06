import type { Market } from "./integration-types.ts";
export const FEED_REFRESH_MS = 20_000;
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
export function mergeFeed(previous: Market[], incoming: Market[], prepend = false): Market[] {
  const prior = new Map(previous.map(market => [market.mint, market]));
  const updates = new Map(incoming.map(market => {
    const old = prior.get(market.mint);
    // Provider gaps must not erase the last known capitalization on each refresh.
    const keepCap = old?.marketCap != null && (market.marketCap == null || old.marketCapKind === "reported" && market.marketCapKind !== "reported");
    return [market.mint, keepCap ? { ...market, marketCap: old.marketCap, marketCapKind: old.marketCapKind } : market];
  }));
  const order = prepend ? [...incoming, ...previous] : [...previous, ...incoming];
  const seen = new Set<string>();
  return order.filter(market => { if (seen.has(market.mint)) return false; seen.add(market.mint); return true; }).map(market => updates.get(market.mint) ?? market).slice(0, 400);
}
export function applyQuotes(markets: Market[], quotes: Market[]): Market[] {
  return markets.map(market => {
    const tokenQuotes = quotes.filter(quote => quote.mint === market.mint);
    const exact = tokenQuotes.find(quote => quote.pool === market.pool);
    const cap = tokenQuotes.find(quote => quote.marketCapKind === "reported") ?? tokenQuotes.find(quote => quote.marketCap != null);
    return { ...market,
      ...(exact ? { price: exact.price ?? market.price, volume24h: exact.volume24h ?? market.volume24h, liquidity: exact.liquidity ?? market.liquidity, change24h: exact.change24h ?? market.change24h } : {}),
      ...(cap && (cap.marketCapKind === "reported" || market.marketCapKind !== "reported") ? { marketCap: cap.marketCap, marketCapKind: cap.marketCapKind } : {}),
    };
  });
}
