"use client";
import { useEffect, useRef, useState } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import { CHART_INTERVALS, type ChartInterval } from "@/lib/chart-options";
import type { Candle } from "@/lib/integration-types";
import { ApiError, rilo } from "@/lib/rilo-client";

type ChartResponse = { candles: Candle[]; observedAt: string; refreshMs: number };
// TradingView Lightweight Charts™
// Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
export function TokenChart({ mint, pool, side }: { mint: string; pool: string; side: string }) {
  const [interval, setInterval] = useState<ChartInterval>("live");
  const [loading, setLoading] = useState(true), [empty, setEmpty] = useState(false), [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController(); let chart: IChartApi | undefined, timer: number | undefined, busy = false, hasData = false;
    setLoading(true); setEmpty(false); setError("");
    async function setup() {
      const { createChart, CandlestickSeries, HistogramSeries, ColorType } = await import("lightweight-charts");
      if (abort.signal.aborted || !host.current) return;
      chart = createChart(host.current, {
        autoSize: true, height: 420,
        layout: { background: { type: ColorType.Solid, color: "#090a0c" }, textColor: "#a7a9b0", fontSize: 11, attributionLogo: true },
        grid: { vertLines: { color: "#ffffff06" }, horzLines: { color: "#ffffff0b" } },
        rightPriceScale: { borderColor: "#ffffff12", scaleMargins: { top: .08, bottom: .23 } },
        timeScale: { borderColor: "#ffffff12", timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 8 },
        crosshair: { vertLine: { color: "#aeb3c050", labelBackgroundColor: "#30343d" }, horzLine: { color: "#aeb3c050", labelBackgroundColor: "#30343d" } },
        handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: false, pressedMouseMove: true },
      });
      const candles = chart.addSeries(CandlestickSeries, { upColor: "#2ab69d", downColor: "#d5697c", wickUpColor: "#2ab69d", wickDownColor: "#d5697c", borderVisible: false });
      const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: .83, bottom: 0 }, visible: false });
      let previous: Candle[] = [];
      async function load() {
        if (abort.signal.aborted || busy || document.hidden) return;
        window.clearTimeout(timer); busy = true; let delay: number = CHART_INTERVALS[interval].refreshMs;
        try {
          const data = await rilo<ChartResponse>(`chart?${new URLSearchParams({ pool, side, interval })}`, undefined, abort.signal);
          if (abort.signal.aborted) return;
          if (data.candles.length) {
            const last = data.candles.at(-1)!;
            if (previous.length && last.time < previous.at(-1)!.time) {
              setError("Waiting for the latest candles. Showing the last chart received.");
              return;
            }
            const precision = last.close > 0 ? Math.min(12, Math.max(2, Math.ceil(-Math.log10(last.close)) + 3)) : 8;
            candles.applyOptions({ priceFormat: { type: "price", precision, minMove: 10 ** -precision } });
            const candleData = data.candles.map(item => ({ ...item, time: item.time as UTCTimestamp }));
            const volumeData = data.candles.map(item => ({ time: item.time as UTCTimestamp, value: item.volume, color: item.close >= item.open ? "#2ab69d55" : "#d5697c55" }));
            const reset = !previous.length || previous.slice(0, -1).some((item, index) => JSON.stringify(item) !== JSON.stringify(data.candles[index]));
            if (reset) { candles.setData(candleData); volume.setData(volumeData); }
            else {
              const lastTime = previous.at(-1)!.time;
              candleData.forEach((item, index) => { if (item.time >= lastTime) { candles.update(item); volume.update(volumeData[index]); } });
            }
            if (!hasData) chart!.timeScale().setVisibleLogicalRange({ from: data.candles.length - 70, to: data.candles.length + 3 });
            previous = data.candles; hasData = true; setEmpty(false); setError("");
          } else if (!hasData) setEmpty(true);
          else setError("Waiting for the latest candles. Showing the last chart received.");
        } catch (failure) {
          if (!abort.signal.aborted) setError(hasData ? "Chart updates delayed. Retrying automatically." : "Chart data is temporarily unavailable. Retrying automatically.");
          delay = failure instanceof ApiError ? Math.max(30_000, failure.retryAfterMs) : 60_000;
        } finally {
          busy = false;
          if (!abort.signal.aborted) { setLoading(false); if (!document.hidden) timer = window.setTimeout(load, delay); }
        }
      }
      const visibility = () => { if (document.hidden) window.clearTimeout(timer); else void load(); };
      document.addEventListener("visibilitychange", visibility);
      abort.signal.addEventListener("abort", () => document.removeEventListener("visibilitychange", visibility), { once: true });
      void load();
    }
    void setup().catch(() => { if (!abort.signal.aborted) { setLoading(false); setError("The chart could not load. Refresh the page to try again."); } });
    return () => { abort.abort(); window.clearTimeout(timer); chart?.remove(); };
  }, [mint, pool, side, interval]);
  return <div className="token-chart">
    <div className="chart-toolbar"><div className="segmented chart-intervals" role="group" aria-label="Chart interval">
      {(Object.keys(CHART_INTERVALS) as ChartInterval[]).map(value => <button type="button" key={value} aria-pressed={interval === value} className={interval === value ? "selected" : ""} onClick={() => setInterval(value)}>{CHART_INTERVALS[value].label}</button>)}
    </div><a className="native-chart-source" href="https://www.geckoterminal.com/" target="_blank" rel="noopener noreferrer" title="Candle data source">GeckoTerminal</a></div>
    <div className="native-chart-frame" role="region" aria-label={CHART_INTERVALS[interval].label + " token price chart"}>
      <div ref={host} className="native-chart-canvas" />
      {(loading || empty) && <p className="native-chart-state" role="status">{loading ? "Loading chart…" : "No candles indexed yet."}</p>}
      {error && <p className="native-chart-warning" role="status">{error}</p>}
    </div>
  </div>;
}
