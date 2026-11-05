"use client";
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart } from "lightweight-charts";
import type { UTCTimestamp, IChartApi, ISeriesApi } from "lightweight-charts";
import type { Candle } from "@/lib/integration-types";
import { CHART_INTERVALS } from "@/lib/chart-options";
import type { ChartInterval } from "@/lib/chart-options";
import { rilo } from "@/lib/rilo-client";
type ChartData = { candles: Candle[]; observedAt: string; interval: ChartInterval };
export function TokenChart({ pool, side }: { pool: string; side: string }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null), candles = useRef<ISeriesApi<"Candlestick"> | null>(null), volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const fitted = useRef(false);
  const [interval, setInterval] = useState<ChartInterval>("live"), [data, setData] = useState<ChartData | null>(null), [error, setError] = useState("");
  const livePool = interval === "live" && side === "base";
  const poolUrl = `https://www.geckoterminal.com/solana/pools/${encodeURIComponent(pool)}`;
  useEffect(() => {
    if (livePool || !host.current) return;
    const api = createChart(host.current, { height: 350, autoSize: true, layout: { background: { type: ColorType.Solid, color: "#0d0d10" }, textColor: "#9696a3", attributionLogo: true }, grid: { vertLines: { color: "#ffffff06" }, horzLines: { color: "#ffffff09" } }, timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#ffffff18" }, rightPriceScale: { borderColor: "#ffffff18" } });
    chart.current = api; fitted.current = false;
    candles.current = api.addSeries(CandlestickSeries, { upColor: "#e0e0e8", downColor: "#555561", borderVisible: false, wickUpColor: "#e0e0e8", wickDownColor: "#7a7a87", priceFormat: { type: "price", precision: 8, minMove: .00000001 } });
    volume.current = api.addSeries(HistogramSeries, { color: "#ffffff55", priceFormat: { type: "volume" }, priceScaleId: "volume" });
    api.priceScale("volume").applyOptions({ scaleMargins: { top: .83, bottom: 0 } });
    return () => { api.remove(); chart.current = null; candles.current = null; volume.current = null; };
  }, [pool, side, interval, livePool]);
  useEffect(() => {
    if (livePool) return;
    const abort = new AbortController(); let timer: number | undefined; let loading = false;
    setData(null); setError("");
    async function load() {
      if (loading || abort.signal.aborted) return;
      window.clearTimeout(timer);
      if (document.hidden) { timer = window.setTimeout(load, CHART_INTERVALS[interval].refreshMs); return; }
      loading = true; let delay: number = CHART_INTERVALS[interval].refreshMs;
      try {
        const next = await rilo<ChartData>(`chart?pool=${encodeURIComponent(pool)}&side=${encodeURIComponent(side)}&interval=${interval}`, undefined, abort.signal);
        if (abort.signal.aborted) return;
        candles.current?.setData(next.candles.map(({ time, open, high, low, close }) => ({ time: time as UTCTimestamp, open, high, low, close })));
        volume.current?.setData(next.candles.map(candle => ({ time: candle.time as UTCTimestamp, value: candle.volume, color: "#ffffff55" })));
        if (!fitted.current && next.candles.length) { chart.current?.timeScale().fitContent(); fitted.current = true; }
        setData(next); setError("");
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Chart unavailable.");
        delay = 60_000;
      } finally { loading = false; if (!abort.signal.aborted) timer = window.setTimeout(load, delay); }
    }
    const resume = () => { if (!document.hidden) void load(); };
    void load(); document.addEventListener("visibilitychange", resume);
    return () => { abort.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", resume); };
  }, [pool, side, interval, livePool]);
  const current = !livePool && data?.interval === interval ? data : null;
  return <div className="token-chart">
    <div className="chart-toolbar"><div className="segmented chart-intervals" role="group" aria-label="Chart interval">{(Object.keys(CHART_INTERVALS) as ChartInterval[]).map(value => <button key={value} type="button" aria-pressed={interval === value} className={interval === value ? "selected" : ""} onClick={() => setInterval(value)}>{CHART_INTERVALS[value].label}</button>)}</div><span className="data-caption" role="status">{livePool ? "Live pool chart" : current ? `Updated ${new Date(current.observedAt).toLocaleTimeString()}` : "Loading…"}</span></div>
    {livePool ? <><iframe title="Live pool price chart" src={`${poolUrl}?embed=1&info=0&swaps=0&light_chart=0&resolution=1m`} style={{ display: "block", width: "100%", height: 420, border: 0 }} /><a className="data-caption" href={poolUrl} target="_blank" rel="noopener noreferrer">Open live chart on GeckoTerminal</a></> : <>
    {error && <p className="form-note" role="alert">{error}{current ? " Showing the last successful data. Retrying shortly." : " Retrying shortly."}</p>}
    {!current && !error && <p className="subtle" role="status">Loading {interval === "live" ? "live" : CHART_INTERVALS[interval].label} candles…</p>}
    {current && !current.candles.length && <p className="empty-note">This pool does not have chart history yet.</p>}
    <div ref={host} className="chart-host" />
    <p className="data-caption">{CHART_INTERVALS[interval].description} · Volume in white · GeckoTerminal indexed data can lag by about a minute · <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charts by TradingView</a></p>
    </>}
  </div>;
}
