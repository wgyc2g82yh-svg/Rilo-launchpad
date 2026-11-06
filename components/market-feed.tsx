"use client";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { TokenAvatar } from "@/components/token-avatar";
import { rilo } from "@/lib/rilo-client";
import { applyQuotes, FEED_REFRESH_MS, mergeFeed } from "@/lib/market-feed-data";
import type { Market, MarketResponse } from "@/lib/integration-types";
export const usd = (value: number | null, compact = false) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: value > 1 ? 2 : 8 }).format(value);
const feeds = [{ mode: "new", label: "New launches" }, { mode: "bonding", label: "Bonding" }, { mode: "graduated", label: "Graduated" }] as const;
export function MarketFeed({ onSelect, search }: { onSelect(market: Market): void; search: ReactNode }) {
  const [mode, setMode] = useState<(typeof feeds)[number]["mode"]>("new");
  const [data, setData] = useState<MarketResponse | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false), [nextPage, setNextPage] = useState<number | null>(null);
  const more = useRef<HTMLDivElement>(null), loadMore = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const abort = new AbortController(); let timer: number, retryMs = FEED_REFRESH_MS, busy = false, markets: Market[] = [], next: number | null = 1, highest = 0, refreshPage = 2, retryPage: number | null = null;
    setData(null); setLoading(true); setError(""); setNextPage(null);
    async function page(number: number, prepend = false) {
      let result: MarketResponse;
      try { result = await rilo<MarketResponse>(`discover?mode=${mode}&page=${number}`, undefined, abort.signal); }
      catch (error) { retryPage = number; throw error; }
      if (retryPage === number) retryPage = null;
      if (abort.signal.aborted) return;
      markets = mergeFeed(markets.filter(market => !result.excludedMints?.includes(market.mint)), result.markets, prepend);
      if (number >= highest) { highest = number; next = result.nextPage ?? null; setNextPage(next); }
      setData({ ...result, markets }); setLoading(false); setError(""); retryMs = FEED_REFRESH_MS;
    }
    const fail = (error: unknown) => { retryMs = error instanceof Error && /busy|capacity/i.test(error.message) ? 60_000 : FEED_REFRESH_MS; if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Market feed is unavailable."); };
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
          const mints = markets.map(market => market.mint);
          for (let offset = 0; offset < mints.length; offset += 270) {
            const batches = [0, 90, 180].map(delta => mints.slice(offset + delta, offset + delta + 90)).filter(batch => batch.length);
            const results = await Promise.allSettled(batches.map(batch => rilo<MarketResponse>(`market/quotes?mints=${batch.join(",")}`, undefined, abort.signal)));
            if (abort.signal.aborted) return;
            markets = applyQuotes(markets, results.flatMap(result => result.status === "fulfilled" ? result.value.markets : []));
            setData(current => current ? { ...current, markets } : current);
          }
        } catch (error) { fail(error); } finally { busy = false; }
      }
      if (!abort.signal.aborted) timer = window.setTimeout(refresh, retryMs);
    }
    async function start() {
      busy = true; setLoadingMore(true);
      try { for (let index = 0; index < 3 && next !== null && !abort.signal.aborted; index++) await page(next); }
      catch (error) { fail(error); }
      finally { busy = false; if (!abort.signal.aborted) { setLoading(false); setLoadingMore(false); timer = window.setTimeout(refresh, retryMs); } }
    }
    void start();
    return () => { abort.abort(); window.clearTimeout(timer); };
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
    <div className="market-table-wrap">{data && <table className="market-table"><thead><tr><th>Token</th><th>Market cap</th><th>24h volume</th><th>Liquidity</th><th>24h</th></tr></thead><tbody>{data.markets.map(market => <tr key={market.pool}><td><button className="token-select" onClick={() => onSelect(market)}><TokenAvatar imageUrl={market.imageUrl} symbol={market.symbol} /><span><strong>{market.symbol}</strong><small>{market.name}</small></span></button></td><td title={market.marketCapKind === "fdv" ? "Estimated cap: fully diluted valuation; circulating supply is unverified" : "Reported market capitalization"}>{market.marketCapKind === "fdv" ? "~" : ""}{usd(market.marketCap ?? null, true)}</td><td className="white-volume">{usd(market.volume24h, true)}</td><td>{usd(market.liquidity, true)}</td><td>{market.change24h === null ? "—" : `${market.change24h > 0 ? "+" : ""}${market.change24h.toFixed(2)}%`}</td></tr>)}</tbody></table>}</div>
    {data?.partial && <p className="subtle" role="status">Some launch data is temporarily unavailable. Showing verified results; coverage retries automatically.</p>}
    {data && <div className="feed-pagination" ref={more}><span>{data.markets.length} tokens loaded</span>{nextPage !== null && <button type="button" className="quiet-button" disabled={loadingMore} onClick={() => void loadMore.current()}>{loadingMore ? "Loading more…" : "Load more tokens"}</button>}</div>}
    {data && <p className="data-caption">{data.source} · Observed {new Date(data.observedAt).toLocaleTimeString()} · Refreshes every 20 seconds · ~ Estimated cap (FDV)</p>}
    {data && !data.markets.length && <p className="empty-note">No {feeds.find(feed => feed.mode === mode)?.label.toLowerCase()} found in the current indexed sample.</p>}
  </section>;
}
