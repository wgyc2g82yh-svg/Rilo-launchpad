"use client";
import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart } from "lightweight-charts";
import type { UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/integration-types";
import { rilo } from "@/lib/rilo-client";
export function TokenChart({ pool, side }: { pool: string; side: string }) {
  const host = useRef<HTMLDivElement>(null), [data, setData] = useState<{ candles: Candle[]; observedAt: string } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError("");
    const load = async () => { try { setData(await rilo(`chart?pool=${pool}&side=${side}`, undefined, abort.signal)); } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Chart unavailable."); } };
    void load(); const timer = window.setInterval(load, 95_000); return () => { abort.abort(); window.clearInterval(timer); };
  }, [pool, side]);
  useEffect(() => {
    if (!host.current || !data?.candles.length) return;
    const chart = createChart(host.current, { height: 350, autoSize: true, layout: { background: { type: ColorType.Solid, color: "#0d0d10" }, textColor: "#9696a3", attributionLogo: true }, grid: { vertLines: { color: "#ffffff06" }, horzLines: { color: "#ffffff09" } }, timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#ffffff18" }, rightPriceScale: { borderColor: "#ffffff18" } });
    const candles = chart.addSeries(CandlestickSeries, { upColor: "#e0e0e8", downColor: "#555561", borderVisible: false, wickUpColor: "#e0e0e8", wickDownColor: "#7a7a87", priceFormat: { type: "price", precision: 8, minMove: .00000001 } });
    const volume = chart.addSeries(HistogramSeries, { color: "#ffffff55", priceFormat: { type: "volume" }, priceScaleId: "volume" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: .83, bottom: 0 } });
    candles.setData(data.candles.map(({ time, open, high, low, close }) => ({ time: time as UTCTimestamp, open, high, low, close })));
    volume.setData(data.candles.map(candle => ({ time: candle.time as UTCTimestamp, value: candle.volume, color: "#ffffff55" }))); chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data]);
  return <div className="token-chart">{error && <p className="form-note">{error}</p>}{!data && !error && <p className="subtle" role="status">Loading five-minute candles…</p>}{data && !data.candles.length && <p className="empty-note">This pool does not have chart history yet.</p>}<div ref={host} className="chart-host" /><p className="data-caption">5-minute candles · Volume in white · GeckoTerminal data · <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charts by TradingView</a></p></div>;
}
