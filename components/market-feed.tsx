"use client";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { TokenAvatar } from "@/components/token-avatar";
import { rilo } from "@/lib/rilo-client";
import type { Market, MarketResponse } from "@/lib/integration-types";
export const usd = (value: number | null, compact = false) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: value > 1 ? 2 : 8 }).format(value);
const feeds = [{ mode: "new", label: "New launches" }, { mode: "bonding", label: "Bonding" }, { mode: "graduated", label: "Graduated" }] as const;
export function MarketFeed({ onSelect, search }: { onSelect(market: Market): void; search: ReactNode }) {
  const [mode, setMode] = useState<(typeof feeds)[number]["mode"]>("new");
  const [data, setData] = useState<MarketResponse | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setLoading(true); setError("");
    async function load() { try { const result = await rilo<MarketResponse>(`discover?mode=${mode}`, undefined, abort.signal); if (!abort.signal.aborted) { setData(result); setError(""); } } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Market feed is unavailable."); } finally { if (!abort.signal.aborted) setLoading(false); } }
    void load(); const timer = window.setInterval(load, 95_000); return () => { abort.abort(); window.clearInterval(timer); };
  }, [mode]);
  return <section className="panel market-feed"><div className="panel-heading"><div><p className="eyebrow">DISCOVER THE MARKET</p><h2>Discover tokens</h2></div></div>
    <div className="discovery-filters" aria-label="Token stage">{feeds.map(feed => <button key={feed.mode} type="button" aria-pressed={mode === feed.mode} onClick={() => { if (mode !== feed.mode) { setData(null); setError(""); setLoading(true); setMode(feed.mode); } }}>{feed.label}</button>)}</div>
    <div style={{marginBottom:24}}>{search}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{loading && <p className="subtle" role="status">Loading market data…</p>}
    <div className="market-table-wrap">{data && <table className="market-table"><thead><tr><th>Token</th><th>Market cap</th><th>24h volume</th><th>Liquidity</th><th>24h</th></tr></thead><tbody>{data.markets.map(market => <tr key={market.pool}><td><button className="token-select" onClick={() => onSelect(market)}><TokenAvatar imageUrl={market.imageUrl} symbol={market.symbol} /><span><strong>{market.symbol}</strong><small>{market.name}</small></span></button></td><td>{usd(market.marketCap ?? null, true)}</td><td className="white-volume">{usd(market.volume24h, true)}</td><td>{usd(market.liquidity, true)}</td><td>{market.change24h === null ? "—" : `${market.change24h > 0 ? "+" : ""}${market.change24h.toFixed(2)}%`}</td></tr>)}</tbody></table>}</div>
    {data && <p className="data-caption">{data.source} · Observed {new Date(data.observedAt).toLocaleTimeString()} · Updates about every 95 seconds</p>}
    {data && !data.markets.length && <p className="empty-note">No {feeds.find(feed => feed.mode === mode)?.label.toLowerCase()} found in the current indexed sample.</p>}
  </section>;
}
