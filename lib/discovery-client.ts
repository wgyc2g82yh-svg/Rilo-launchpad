import type { MarketResponse } from "./integration-types.ts";
import type { DiscoveryMode } from "./discovery-policy.ts";
import { mergeMarket } from "./market-feed-data.ts";
import { isSolanaAddress } from "./token-analysis.ts";

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export class DiscoveryRequestError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs = 5000) { super(message); this.retryAfterMs = retryAfterMs; }
}
export function createDiscoveryStore(load: (path: string) => Promise<MarketResponse>, now = Date.now, storage?: () => Storage) {
  const values = new Map<DiscoveryMode, MarketResponse>(), inflight = new Map<string, Promise<MarketResponse>>();
  const key = (mode: DiscoveryMode) => `rilo-discovery-v1:${mode}`;
  function read(mode: DiscoveryMode): MarketResponse | null {
    try {
      const value = values.get(mode) ?? JSON.parse(storage?.().getItem(key(mode)) ?? "null");
      const age = now() - Date.parse(value?.observedAt ?? "");
      if (!value || !Number.isFinite(age) || age < 0 || age > 60_000 || !Array.isArray(value.markets) || value.markets.length > 400) return null;
      if (!value.markets.every((market: { mint?: unknown; pool?: unknown; symbol?: unknown }) => typeof market.mint === "string" && isSolanaAddress(market.mint) && typeof market.pool === "string" && isSolanaAddress(market.pool) && typeof market.symbol === "string")) return null;
      return { ...value, stale: Boolean(value.stale) };
    } catch { return null; }
  }
  function save(mode: DiscoveryMode, value: MarketResponse) {
    const previous = values.get(mode);
    if (previous && Date.parse(previous.observedAt) > Date.parse(value.observedAt)) return;
    if (previous) { const old = new Map(previous.markets.map(market => [market.mint, market])); value = { ...value, markets: value.markets.map(market => mergeMarket(old.get(market.mint), market)) }; }
    values.set(mode, value);
    try { storage?.().setItem(key(mode), JSON.stringify(value)); } catch { /* Private browsing and full storage must not block data. */ }
  }
  function request(mode: DiscoveryMode, page = 1, expanded = false): Promise<MarketResponse> {
    const path = `discover?mode=${mode}&page=${page}${expanded ? "&expand=1" : ""}`;
    const existing = inflight.get(path); if (existing) return existing;
    const pending = load(path).then(value => { if (page === 1) save(mode, value); return value; }).finally(() => inflight.delete(path));
    inflight.set(path, pending); return pending;
  }
  return { read, save, request };
}
const store = createDiscoveryStore(async path => {
  let response: Response;
  try { response = await fetch(`/api/rilo/${path}`, { signal: AbortSignal.timeout(path.includes("expand=1") ? 20_000 : 12_000), cache: "no-store" }); }
  catch { throw new DiscoveryRequestError("The launch feed is taking too long. Retrying shortly."); }
  let value;
  try { value = await response.json(); } catch { throw new DiscoveryRequestError("The launch feed could not respond. Retrying shortly."); }
  if (!response.ok) {
    const retry = Number(response.headers.get("Retry-After"));
    throw new DiscoveryRequestError(value.error || "The launch feed is temporarily unavailable.", retry > 0 ? Math.min(300_000, retry * 1000) : response.status === 429 ? 60_000 : 5000);
  }
  return value as MarketResponse;
}, Date.now, () => window.sessionStorage);
export const readDiscoveryCache = store.read;
export const saveDiscoveryCache = store.save;
export const requestDiscovery = store.request;
export function prefetchDiscovery(mode: DiscoveryMode) {
  if (!store.read(mode)) void store.request(mode).catch(() => {});
}
