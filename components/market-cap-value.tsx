"use client";
import { useEffect, useRef, useState } from "react";
import type { Market } from "@/lib/integration-types";
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
export function MarketCapValue({ market }: { market: Market | null }) {
  const value = market?.marketCap ?? null;
  const previous = useRef({ mint: market?.mint, value });
  const [direction, setDirection] = useState("");
  useEffect(() => {
    const old = previous.current;
    previous.current = { mint: market?.mint, value };
    if (old.mint !== market?.mint || old.value === null || value === null || old.value === value) { setDirection(""); return; }
    setDirection(value > old.value ? "cap-rise" : "cap-fall");
    const timer = window.setTimeout(() => setDirection(""), 1200);
    return () => window.clearTimeout(timer);
  }, [market?.mint, value]);
  return <span className={`live-market-cap ${direction}`} title={market?.quotedAt ? `Quote checked ${new Date(market.quotedAt).toLocaleTimeString()}` : undefined}>{market?.marketCapKind === "fdv" ? "~ " : ""}{value === null ? "—" : dollars.format(value)}</span>;
}
