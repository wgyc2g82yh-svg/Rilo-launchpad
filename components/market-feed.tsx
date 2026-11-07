"use client";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { readDiscoveryCache, saveDiscoveryCache, requestDiscovery, prefetchDiscovery, DiscoveryRequestError } from "@/lib/discovery-client";
import { MarketCapValue } from "@/components/market-cap-value";
import { TokenAvatar } from "@/components/token-avatar";
import { ApiError, rilo } from "@/lib/rilo-client";
import { applyQuotes, FEED_REFRESH_MS, mergeMarket, liveQuoteBatches, LIVE_QUOTE_REFRESH_MS } from "@/lib/market-feed-data";
import { reconcileDiscoveryPages, discoveryPageMarkets, rankDiscovery } from "@/lib/discovery-policy";
import type { Market, MarketResponse } from "@/lib/integration-types";
export const usd = (value: number | null, compact = false) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: value > 1 ? 2 : 8 }).format(value);
const feeds = [{ mode: "new", label: "New launches" }, { mode: "bonding", label: "Bonding" }, { mode: "graduated", label: "Graduated" }] as const;
export function MarketFeed({ onSelect, search }: { onSelect(market: Market): void; search: ReactNode }) {
  const [mode, setMode] = useState<(typeof feeds)[number]["mode"]>("new");
  const [data, setData] = useState<MarketResponse | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false), [nextPage, setNextPage] = useState<number | null>(null);
  const [quoteError, setQuoteError] = useState(""), [quoteCheckedAt, setQuoteCheckedAt] = useState<string | null>(null);
  const paused = useRef(false), pendingData = useRef<MarketResponse | null>(null);
  const more = useRef<HTMLDivElement>(null), loadMore = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const abort = new AbortController(); let timer: number, retryMs = FEED_REFRESH_MS, busy = false, markets: Market[] = [], next: number | null = 1, highest = 0, refreshPage = 2, retryPage: number | null = null;
    let snapshot: MarketResponse | null = null, releaseTimer: number;
    let quoteTimer: number | undefined, quoteBusy = false, quoteNotBefore = 0;
    setQuoteError(""); setQuoteCheckedAt(null);
    let pages = new Map<number, MarketResponse>();
    const restored = readDiscoveryCache(mode);
    if (restored) {
      markets = restored.markets; snapshot = restored; highest = 1; next = restored.nextPage ?? null;
      pages.set(1, restored);
    }
    const artworkRetryAt = new Map<string, number>();
    paused.current = false; pendingData.current = null;
    const publish = (value: MarketResponse) => {
      if (abort.signal.aborted) return;
      const head = pages.get(1);
      if (head) { const mints = new Set(head.markets.map(market => market.mint)); saveDiscoveryCache(mode, { ...head, markets: value.markets.filter(market => mints.has(market.mint)) }); }
      if (paused.current) pendingData.current = value; else setData(value);
    };
    const release = () => { window.clearTimeout(releaseTimer); releaseTimer = window.setTimeout(() => { paused.current = false; if (!abort.signal.aborted && pendingData.current) { setData(pendingData.current); pendingData.current = null; } }, 0); };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    setData(restored); setLoading(!restored); setSearching(false); setError(""); setNextPage(next === 1 ? null : next);
    async function page(number: number, expand = pages.get(number)?.expanded ?? false) {
      let result: MarketResponse;
      try { result = await requestDiscovery(mode, number, expand); }
      catch (error) { retryPage = number; throw error; }
      if (retryPage === number) retryPage = null;
      if (abort.signal.aborted) return;
      pages = reconcileDiscoveryPages(pages, result);
      const previous = new Map(markets.map(market => [market.mint, market]));
      markets = discoveryPageMarkets(pages, mode).map(market => mergeMarket(previous.get(market.mint), market));
      if (number >= highest) { highest = number; next = result.nextPage ?? null; setNextPage(next); }
      snapshot = { ...result, markets, stale: [...pages.values()].some(item => item.stale), partial: [...pages.values()].some(item => item.partial) };
      publish(snapshot); setLoading(false); setError(""); retryMs = FEED_REFRESH_MS;
      void loadArtwork();
      return result;
    }
    const fail = (error: unknown) => { retryMs = error instanceof ApiError || error instanceof DiscoveryRequestError ? error.retryAfterMs : error instanceof Error && /busy|capacity/i.test(error.message) ? 60_000 : FEED_REFRESH_MS; if (!abort.signal.aborted) setError(markets.length ? "Launch list updates are delayed. Showing the last received entries; retrying automatically." : error instanceof Error ? error.message + " Retrying automatically." : "Market feed is unavailable. Retrying automatically."); };
    async function loadArtwork() {
      const missing = markets.filter(market => !market.imageUrl && (artworkRetryAt.get(market.mint) ?? 0) <= Date.now()).map(market => market.mint).slice(0, 90);
      if (!missing.length || abort.signal.aborted) return;
      missing.forEach(mint => artworkRetryAt.set(mint, Date.now() + 60_000));
      try {
        const data = await rilo<{ artwork: { mint: string; imageUrl: string | null; fallbackImageUrl: string | null }[] }>(`market/artwork?mints=${missing.join(",")}`, undefined, abort.signal);
        if (abort.signal.aborted) return;
        const images = new Map(data.artwork.map(image => [image.mint, image]));
        markets = markets.map(market => { const image = images.get(market.mint); return image?.imageUrl && !market.imageUrl ? { ...market, imageUrl: image.imageUrl, fallbackImageUrl: image.fallbackImageUrl } : market; });
        if (snapshot) { snapshot = { ...snapshot, markets }; publish(snapshot); }
      } catch { /* Optional artwork must never hold up or erase the market list. */ }
    }
    async function expandCoverage(number: number, result?: MarketResponse) {
      if (!result || !result.expandable || abort.signal.aborted || (mode === "new" && result.markets.length > 0)) return;
      if (!markets.length) setSearching(true);
      try {
        await page(number, true);
        // Check a bounded extra batch automatically instead of making an empty
        // filtered first page look like the end of the entire launch feed.
        if (!markets.length && next !== null && number === 1) { const extra = await page(next); if (extra?.expandable && !extra.markets.length) await page(extra.page ?? 2, true); }
      } catch (error) { fail(error); }
      finally { if (!abort.signal.aborted) setSearching(false); }
    }
    loadMore.current = async () => {
      if (busy || next === null || abort.signal.aborted) return;
      busy = true; setLoadingMore(true);
      try { const number = next; const result = await page(number); await expandCoverage(number, result); }
      catch (error) { fail(error); } finally { busy = false; if (!abort.signal.aborted) setLoadingMore(false); }
    };
    async function refresh() {
      if (!busy && !document.hidden) {
        busy = true;
        try {
          // The newest page always refreshes first, even if an older page keeps failing.
          const resume = retryPage;
          const head = await page(1);
          await expandCoverage(1, head);
          if (resume !== null && resume !== 1) await page(resume);
          // Rotate older pages to update stages without repeatedly downloading the entire feed.
          else if (highest > 1) { await page(refreshPage); refreshPage = refreshPage >= highest ? 2 : refreshPage + 1; }

        } catch (error) { fail(error); } finally { busy = false; }
      }
      if (!abort.signal.aborted) timer = window.setTimeout(refresh, retryMs);
    }
    // Quotes run independently: slow stage lookups and pagination cannot hold up prices.
    async function refreshQuotes() {
      if (abort.signal.aborted || quoteBusy) return;
      window.clearTimeout(quoteTimer);
      if (document.hidden) return;
      if (Date.now() < quoteNotBefore) { quoteTimer = window.setTimeout(refreshQuotes, quoteNotBefore - Date.now()); return; }
      quoteBusy = true;
      try {
        let oldest: number | null = null;
        for (const batch of liveQuoteBatches(markets)) {
          if (abort.signal.aborted || document.hidden) break;
          const result = await rilo<MarketResponse>(`market/quotes?mints=${batch.join(",")}`, undefined, abort.signal);
          if (abort.signal.aborted) return;
          markets = applyQuotes(markets, result.markets);
          if (snapshot) { snapshot = { ...snapshot, markets }; publish(snapshot); }
          if (result.markets.length) {
            const time = Date.parse(result.observedAt);
            if (Number.isFinite(time)) oldest = Math.min(oldest ?? time, time);
          }
        }
        if (oldest !== null) setQuoteCheckedAt(new Date(oldest).toISOString());
        setQuoteError("");
      } catch (error) {
        if (!abort.signal.aborted) {
          const delay = error instanceof ApiError ? error.retryAfterMs : 20_000;
          quoteNotBefore = Date.now() + Math.max(LIVE_QUOTE_REFRESH_MS, delay);
          setQuoteError("Quote updates delayed · Keeping the last received values and retrying automatically.");
        }
      } finally {
        quoteBusy = false;
        if (!abort.signal.aborted && !document.hidden) quoteTimer = window.setTimeout(refreshQuotes, Math.max(LIVE_QUOTE_REFRESH_MS, quoteNotBefore - Date.now()));
      }
    }
    const resumeQuotes = () => { if (document.hidden) window.clearTimeout(quoteTimer); else void refreshQuotes(); };
    document.addEventListener("visibilitychange", resumeQuotes); window.addEventListener("online", resumeQuotes);
    async function start() {
      busy = true;
      try {
        const result = await page(1);
        // Render and start quotes before optional wider coverage or image metadata.
        void refreshQuotes();
        await expandCoverage(1, result);
      } catch (error) { fail(error); }
      finally {
        busy = false;
        if (!abort.signal.aborted) { setLoading(false); setLoadingMore(false); timer = window.setTimeout(refresh, retryMs); void refreshQuotes(); }
      }
    }
    void start();
    return () => { abort.abort(); window.clearTimeout(timer); window.clearTimeout(quoteTimer); document.removeEventListener("visibilitychange", resumeQuotes); window.removeEventListener("online", resumeQuotes); window.clearTimeout(releaseTimer); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); pendingData.current = null; };
  }, [mode]);
  const visibleMarkets = rankDiscovery(data?.markets ?? [], mode);
  useEffect(() => {
    if (!more.current || nextPage === null || loadingMore || error || (data?.markets.length ?? 0) < 10) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore.current(); }, { rootMargin: "200px" });
    observer.observe(more.current); return () => observer.disconnect();
  }, [nextPage, loadingMore, error, data?.markets.length]);
  return <section className="panel market-feed"><div className="panel-heading"><div><p className="eyebrow">DISCOVER THE MARKET</p><h2>Discover tokens</h2></div></div>
    <div className="discovery-filters" aria-label="Token stage">{feeds.map(feed => <button key={feed.mode} type="button" onPointerEnter={() => prefetchDiscovery(feed.mode)} onFocus={() => prefetchDiscovery(feed.mode)} aria-pressed={mode === feed.mode} onClick={() => { if (mode !== feed.mode) { setError(""); setMode(feed.mode); } }}>{feed.label}</button>)}</div>
    <p className="feed-policy">{mode === "new" ? "Newest launchpad tokens · Last 30 minutes" : mode === "bonding" ? "80–<100% bonded · Closest to graduation first" : "Confirmed migrations · Most recent first"}</p>
    <div style={{marginBottom:24}}>{search}</div>
    {error && !data && <p className="form-error" role="alert">{error}</p>}{loading && <p className="subtle" role="status">Loading latest launches…</p>}
    {searching && <p className="subtle" role="status">Checking more launchpad pools…</p>}
    <div className="market-table-wrap">{data && visibleMarkets.length > 0 && <table className="market-table" onPointerDownCapture={event => { if (event.isPrimary) paused.current = true; }}><thead><tr><th>Token</th><th>Market cap</th><th>24h volume</th><th>Liquidity</th><th>24h</th></tr></thead><tbody>{visibleMarkets.map(market => <tr key={market.mint} className="market-row" onClick={() => onSelect(market)}><td><button type="button" className="token-select" aria-label={`Open ${market.symbol} token`} onClick={event => { event.stopPropagation(); onSelect(market); }}><TokenAvatar imageUrl={market.imageUrl} fallbackImageUrl={market.fallbackImageUrl} symbol={market.symbol} /><span><strong>{market.symbol}</strong><small>{market.name}</small><small className="token-stage-meta">{mode === "bonding" ? `${market.graduationProgress?.toFixed(1)}% bonded` : mode === "new" ? launchAge(market.launchCreatedAt ?? market.createdAt) : market.graduatedAt ? `Graduated ${launchAge(market.graduatedAt)}` : "Graduated"}</small></span></button></td><td title={market.marketCapKind === "fdv" ? "Estimated cap: fully diluted valuation; circulating supply is unverified" : "Reported market capitalization"}><MarketCapValue market={market} /></td><td className="white-volume">{usd(market.volume24h, true)}</td><td>{usd(market.liquidity, true)}</td><td>{market.change24h === null ? "—" : `${market.change24h > 0 ? "+" : ""}${market.change24h.toFixed(2)}%`}</td></tr>)}</tbody></table>}</div>
    {quoteError && data && <p className="form-note" role="status">{quoteError}</p>}
    {error && data && <p className="form-note" role="status">{error}</p>}
    {data?.stale && <p className="form-note" role="status">Launch list snapshot delayed. Last received {new Date(data.observedAt).toLocaleTimeString()}; retrying automatically.</p>}
    {data?.partial && <p className="subtle" role="status">Some launch data is temporarily unavailable. Showing verified results; coverage retries automatically.</p>}
    {data && <div className="feed-pagination" ref={more}><span>{visibleMarkets.length} tokens loaded</span>{nextPage !== null && <button type="button" className="quiet-button" disabled={loadingMore} onClick={() => void loadMore.current()}>{loadingMore ? "Loading more…" : "Load more tokens"}</button>}</div>}
    {data && <p className="data-caption">{data.source} · Observed {new Date(data.observedAt).toLocaleTimeString()}{visibleMarkets.length > 0 && <> · Quotes refresh every 5 seconds{quoteCheckedAt ? ` · Quotes checked ${new Date(quoteCheckedAt).toLocaleTimeString()}` : ""}</>} · Discovery refreshes every 20 seconds · ~ Estimated cap (FDV)</p>}
    {data && !visibleMarkets.length && !searching && <p className="empty-note">{mode === "bonding" ? "No verified curves at 80–<100% in the pools checked so far. New candidates are checked automatically." : `No matching ${feeds.find(feed => feed.mode === mode)?.label.toLowerCase()} in the pools checked so far.`}</p>}
  </section>;
}

function launchAge(value: string | null | undefined): string {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "Age unavailable";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
}
