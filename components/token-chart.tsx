"use client";
import { useState } from "react";
import { CHART_INTERVALS, type ChartInterval } from "@/lib/chart-options";

const resolutions = { live: "1m", "5m": "5m", "4h": "4h" } as const;
const minutes = { live: "1", "5m": "5", "4h": "240" } as const;

export function TokenChart({ mint, pool, side }: { mint: string; pool: string; side: string }) {
  const [interval, setInterval] = useState<ChartInterval>("live");
  const poolUrl = "https://www.geckoterminal.com/solana/pools/" + encodeURIComponent(pool);
  const tokenUrl = "https://birdeye.so/token/" + encodeURIComponent(mint) + "?chain=solana";
  const src = side === "base"
    ? poolUrl + "?embed=1&info=0&swaps=0&light_chart=0&resolution=" + resolutions[interval]
    : "https://birdeye.so/tv-widget/" + encodeURIComponent(mint) + "?chain=solana&theme=dark&chartInterval=" + minutes[interval];
  return <div className="token-chart">
    <div className="chart-toolbar"><div className="segmented chart-intervals" role="group" aria-label="Chart interval">
      {(Object.keys(CHART_INTERVALS) as ChartInterval[]).map(value => <button type="button" key={value} aria-pressed={interval === value} className={interval === value ? "selected" : ""} onClick={() => setInterval(value)}>{CHART_INTERVALS[value].label}</button>)}
    </div></div>
    <iframe key={src} title={CHART_INTERVALS[interval].label + " token price chart"} src={src} style={{ display: "block", width: "100%", height: 420, border: 0 }} />
    <a className="data-caption" href={side === "base" ? poolUrl : tokenUrl} target="_blank" rel="noopener noreferrer">Open {side === "base" ? "pool" : "token"} chart</a>
  </div>;
}
