export const CHART_INTERVALS = {
  live: { label: "Live", timeframe: "minute", aggregate: 1, refreshMs: 15_000, cacheMs: 15_000, description: "1-minute candles · Auto-refresh 15s" },
  "5m": { label: "5M", timeframe: "minute", aggregate: 5, refreshMs: 60_000, cacheMs: 60_000, description: "5-minute candles · Auto-refresh 60s" },
  "4h": { label: "4H", timeframe: "hour", aggregate: 4, refreshMs: 60_000, cacheMs: 60_000, description: "4-hour candles · Auto-refresh 60s" },
} as const;
export type ChartInterval = keyof typeof CHART_INTERVALS;
export function isChartInterval(value: string): value is ChartInterval {
  return Object.prototype.hasOwnProperty.call(CHART_INTERVALS, value);
}
