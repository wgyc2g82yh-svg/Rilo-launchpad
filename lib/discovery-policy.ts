import type { Market, MarketResponse } from "./integration-types.ts";
export const NEW_LAUNCH_MAX_AGE_MS = 30 * 60_000;
export const NEAR_GRADUATION_PERCENT = 80;
// Curve venues identify launch pools; a fresh secondary DEX pool is not a new token.
export const LAUNCH_CURVE_DEXES = new Set(["pump-fun", "meteora-dbc", "raydium-launchlab", "moonshot", "moonit", "boop-fun", "letsbonk-fun"]);
export type DiscoveryMode = "new" | "bonding" | "graduated";
function time(value: string | null | undefined): number { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : 0; }
export function eligibleDiscovery(market: Market, mode: DiscoveryMode, now = Date.now()): boolean {
  if (mode === "graduated") return market.launchStage === "graduated";
  const progress = market.graduationProgress;
  if (market.launchStage !== "bonding" || typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress >= 100) return false;
  if (mode === "bonding") return progress >= NEAR_GRADUATION_PERCENT;
  const launched = time(market.launchCreatedAt ?? market.createdAt), age = now - launched;
  return LAUNCH_CURVE_DEXES.has(market.dex) && progress < NEAR_GRADUATION_PERCENT && launched > 0 && age >= 0 && age <= NEW_LAUNCH_MAX_AGE_MS;
}
export function rankDiscovery(markets: Market[], mode: DiscoveryMode, now = Date.now()): Market[] {
  const rows = markets.filter(market => eligibleDiscovery(market, mode, now));
  rows.sort((a, b) => {
    if (mode === "bonding") { const progress = (b.graduationProgress ?? 0) - (a.graduationProgress ?? 0); if (progress) return progress; }
    const latest = mode === "graduated" ? time(b.graduatedAt ?? b.createdAt) - time(a.graduatedAt ?? a.createdAt) : time(b.launchCreatedAt ?? b.createdAt) - time(a.launchCreatedAt ?? a.createdAt);
    return latest || a.mint.localeCompare(b.mint);
  });
  const seen = new Set<string>();
  return rows.filter(market => { if (seen.has(market.mint)) return false; seen.add(market.mint); return true; }).slice(0, 400);
}
// Replace each page's membership instead of accumulating every mint ever seen.
// Retain other loaded pages, and apply explicit stage removals only to older evidence.
export function reconcileDiscoveryPages(previous: Map<number, MarketResponse>, incoming: MarketResponse): Map<number, MarketResponse> {
  const pages = new Map(previous), page = incoming.page ?? 1, old = pages.get(page);
  if (old && time(old.observedAt) > time(incoming.observedAt)) return pages;
  pages.set(page, incoming);
  for (const [number, result] of pages) {
    if (time(result.observedAt) <= time(incoming.observedAt) && incoming.excludedMints?.length) pages.set(number, { ...result, markets: result.markets.filter(market => !incoming.excludedMints!.includes(market.mint)) });
  }
  return pages;
}
export function discoveryPageMarkets(pages: Map<number, MarketResponse>, mode: DiscoveryMode, now = Date.now()): Market[] {
  const newest = [...pages.values()].sort((a, b) => time(b.observedAt) - time(a.observedAt));
  const byMint = new Map<string, Market>(), excludedAt = new Map<string, number>();
  for (const page of newest) for (const mint of page.excludedMints ?? []) excludedAt.set(mint, Math.max(excludedAt.get(mint) ?? 0, time(page.observedAt)));
  for (const page of newest) for (const market of page.markets) {
    if (!byMint.has(market.mint) && (excludedAt.get(market.mint) ?? -1) < time(page.observedAt)) byMint.set(market.mint, market);
  }
  return rankDiscovery([...byMint.values()], mode, now);
}

// A pagination response must not replace the newest page's freshness or source.
// Older rows remain available while their own refresh is retried independently.
export function discoverySnapshot(pages: Map<number, MarketResponse>, mode: DiscoveryMode): MarketResponse | null {
  const head = pages.get(1);
  if (!head) return null;
  return { ...head, markets: discoveryPageMarkets(pages, mode) };
}
