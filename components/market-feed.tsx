"use client";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TokenAvatar } from "@/components/token-avatar";
import { ApiError, rilo } from "@/lib/rilo-client";
import { applyQuotes, FEED_REFRESH_MS, mergeFeed, quoteBatch } from "@/lib/market-feed-data";
import type { Market, MarketResponse } from "@/lib/integration-types";
export const usd = (value: number | null, compact = false) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: value > 1 ? 2 : 8 }).format(value);
const feeds = [{ mode: "new", label: "New launches" }, { mode: "bonding", label: "Bonding" }, { mode: "graduated", label: "Graduated" }] as const;
export function MarketFeed({ onSelect, search }: { onSelect(market: Market): void; search: ReactNode }) {
  const [mode, setMode] = useState<(typeof feeds)[number]["mode"]>("new");
  const [data, setData] = useState<MarketResponse | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false), [nextPage, setNextPage] = useState<number | null>(null);
  const paused = useRef(false), pendingData = useRef<MarketResponse | null>(null);
  const more = useRef<HTMLDivElement>(null), loadMore = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const abort = new AbortController(); let timer: number, retryMs = FEED_REFRESH_MS, busy = false, markets: Market[] = [], next: number | null = 1, highest = 0, refreshPage = 2, quoteOffset = 0, retryPage: number | null = null;
    let snapshot: MarketResponse | null = null, releaseTimer: number;
    const coverage = new Map<number, { stale: boolean; partial: boolean }>();
    paused.current = false; pendingData.current = null;
    const publish = (value: MarketResponse) => { if (paused.current) pendingData.current = value; else setData(value); };
    const release = () => { window.clearTimeout(releaseTimer); releaseTimer = window.setTimeout(() => { paused.current = false; if (!abort.signal.aborted && pendingData.current) { setData(pendingData.current); pendingData.current = null; } }, 0); };
    window.addEventListener("pointerup", release); window.addEventListener("pointercancel", release);
    setData(null); setLoading(true); setError(""); setNextPage(null);
    async function page(number: number, prepend = false) {
      let result: MarketResponse;
      try { result = await rilo<MarketResponse>(`discover?mode=${mode}&page=${number}`, undefined, abort.signal); }
      catch (error) { retryPage = number; throw error; }
      if (retryPage === number) retryPage = null;
      if (abort.signal.aborted) return;
      markets = mergeFeed(markets.filter(market => !result.excludedMints?.includes(market.mint)), result.markets, prepend);
      if (number >= highest) { highest = number; next = result.nextPage ?? null; setNextPage(next); }
      coverage.set(number, { stale: Boolean(result.stale), partial: Boolean(result.partial) });
      snapshot = { ...result, markets, stale: [...coverage.values()].some(item => item.stale), partial: [...coverage.values()].some(item => item.partial) };
      publish(snapshot); setLoading(false); setError(""); retryMs = snapshot.stale ? 60_000 : FEED_REFRESH_MS;
    }
    const fail = (error: unknown) => { retryMs = error instanceof ApiError ? error.retryAfterMs : error instanceof Error && /busy|capacity/i.test(error.message) ? 60_000 : FEED_REFRESH_MS; if (!abort.signal.aborted) setError(markets.length ? "Live updates are delayed. Showing the last data received; retrying automatically." : error instanceof Error ? error.message + " Retrying automatically." : "Market feed is unavailable. Retrying automatically."); };
    loadMore.current = async () => {
      if (busy || next === null || abort.signal.aborted) return;
      busy = true; setLoadingMore(true);
      try { await page(next); } catch (error) { fail(error); } finally { busy = false; if (!abort.signal.aborted) setLoadingMore(false); }
    };
    async function refresh() {
      if (!busy && !document.hidden) {
        busy = true;
        try {
          // Resume a failed pagination request after backoff, even when the error
          // has paused the scroll observer. Otherwise a feed can stay on page one.
          const resume = retryPage;
          if (resume !== null) await page(resume, resume === 1);
          else await page(1, true);
          // Rotate older pages to update stages without repeatedly downloading the entire feed.
          if (highest > 1) { await page(refreshPage); refreshPage = refreshPage >= highest ? 2 : refreshPage + 1; }
          // Rotate one bounded quote batch per refresh instead of downloading
          // every loaded token again. New launches and older pages also refresh.
          const batch = quoteBatch(markets, quoteOffset); quoteOffset = batch.nextOffset;
          if (batch.mints.length) {
            const result = await rilo<MarketResponse>(`market/quotes?mints=${batch.mints.join(",")}`, undefined, abort.signal);
            if (abort.signal.aborted) return;
            markets = applyQuotes(markets, result.markets);
            if (snapshot) { snapshot = { ...snapshot, markets }; publish(snapshot); }
          }
        } catch (error) { fail(error); } finally { busy = false; }
      }
      if (!abort.signal.aborted) timer = window.setTimeout(refresh, retryMs);
    }
    async function start() {
      busy = true; setLoadingMore(true);
      try { if (next !== null) await page(next); }
      catch (error) { fail(error); }
      finally { busy = false; if (!abort.signal.aborted) { setLoading(false); setLoadingMore(false); timer = window.setTimeout(refresh, retryMs); } }
    }
    void start();
    return () => { abort.abort(); window.clearTimeout(timer); window.clearTimeout(releaseTimer); window.removeEventListener("pointerup", release); window.removeEventListener("pointercancel", release); pendingData.current = null; };
  }, [mode]);
  useEffect(() => {
    if (!more.current || nextPage === null || loadingMore || error) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore.current(); }, { rootMargin: "200px" });
    observer.observe(more.current); return () => observer.disconnect();
  }, [nextPage, loadingMore, error]);
  return <section className="panel market-feed"><div className="panel-heading"><div><p className="eyebrow">DISCOVER THE MARKET</p><h2>Discover tokens</h2></div></div>
    <div className="discovery-filters" aria-label="Token stage">{feeds.map(feed => <button key={feed.mode} type="button" aria-pressed={mode === feed.mode} onClick={() => { if (mode !== feed.mode) { setData(null); setError(""); setLoading(true); setMode(feed.mode); } }}>{feed.label}</button>)}</div>
    <div style={{marginBottom:24}}>{search}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{loading && <p className="subtle" role="status">Loading market data…</p>}
    <div className="market-table-wrap">{data && <table className="market-table" onPointerDownCapture={event => { if (event.isPrimary) paused.current = true; }}><thead><tr><th>Token</th><th>Market cap</th><th>24h volume</th><th>Liquidity</th><th>24h</th></tr></thead><tbody>{data.markets.map(market => <tr key={market.mint} className="market-row" onClick={() => onSelect(market)}><td><button type="button" className="token-select" aria-label={`Open ${market.symbol} token`} onClick={event => { event.stopPropagation(); onSelect(market); }}><TokenAvatar imageUrl={market.imageUrl} symbol={market.symbol} /><span><strong>{market.symbol}</strong><small>{market.name}</small></span></button></td><td title={market.marketCapKind === "fdv" ? "Estimated cap: fully diluted valuation; circulating supply is unverified" : "Reported market capitalization"}>{market.marketCapKind === "fdv" ? "~" : ""}{usd(market.marketCap ?? null, true)}</td><td className="white-volume">{usd(market.volume24h, true)}</td><td>{usd(market.liquidity, true)}</td><td>{market.change24h === null ? "—" : `${market.change24h > 0 ? "+" : ""}${market.change24h.toFixed(2)}%`}</td></tr>)}</tbody></table>}</div>
    {data?.stale && <p className="form-note" role="status">Live data is delayed. Showing the last successful snapshot from {new Date(data.observedAt).toLocaleTimeString()}; retrying automatically.</p>}
    {data?.partial && <p className="subtle" role="status">Some launch data is temporarily unavailable. Showing verified results; coverage retries automatically.</p>}
    {data && <div className="feed-pagination" ref={more}><span>{data.markets.length} tokens loaded</span>{nextPage !== null && <button type="button" className="quiet-button" disabled={loadingMore} onClick={() => void loadMore.current()}>{loadingMore ? "Loading more…" : "Load more tokens"}</button>}</div>}
    {data && <p className="data-caption">{data.source} · Observed {new Date(data.observedAt).toLocaleTimeString()} · Refreshes every 20 seconds · ~ Estimated cap (FDV)</p>}
    {data && !data.markets.length && <p className="empty-note">No {feeds.find(feed => feed.mode === mode)?.label.toLowerCase()} found in the current indexed sample.</p>}
  </section>;
}
