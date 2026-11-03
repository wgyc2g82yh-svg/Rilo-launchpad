"use client";
import { useEffect, useState } from "react";
import { rilo } from "@/lib/rilo-client";
import type { LiquidityEvidence } from "@/lib/liquidity-evidence";
const labels = { locked: "Locked / burned reported", partial: "Partially locked reported", unlocked: "Unlocked reported", unknown: "Unverified" };
export function LiquidityStatus({ mint, pool }: { mint: string; pool: string }) {
  const [data, setData] = useState<LiquidityEvidence | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController(); let timer: number | undefined;
    setData(null); setError("");
    async function load() {
      try {
        if (!document.hidden) { const next = await rilo<LiquidityEvidence>(`liquidity?mint=${encodeURIComponent(mint)}&pool=${encodeURIComponent(pool)}`, undefined, abort.signal); if (!abort.signal.aborted) { setData(next); setError(""); } }
      } catch { if (!abort.signal.aborted) setError("Liquidity verification is temporarily unavailable."); }
      finally { if (!abort.signal.aborted) timer = window.setTimeout(load, 60_000); }
    }
    void load(); return () => { abort.abort(); window.clearTimeout(timer); };
  }, [mint, pool]);
  return <section className="panel liquidity-status" aria-label="Liquidity lock status"><div className="panel-heading"><h3>Liquidity protection</h3><span className={`badge liquidity-${error ? "unknown" : data?.status ?? "unknown"}`} role="status">{error ? "Unverified" : data ? labels[data.status] : "Checking…"}</span></div>
    {error ? <p className="subtle">{error} Retrying shortly.</p> : data ? <><div className="liquidity-readings"><div><span>Tracked LP locked / burned</span><strong>{data.lockedPercent === null ? "Unverified" : `${data.lockedPercent.toFixed(2)}%`}</strong></div><div><span>Developer withdrawal control</span><strong>Unverified</strong></div></div><p className="subtle">{data.detail}</p></> : <p className="subtle">Reading the selected pool’s liquidity evidence…</p>}
    <p className="subtle">A lock reading does not establish token safety. Unlocked liquidity alone does not prove developer ownership or a rug pull.</p><p className="data-caption address">Selected pool: {pool}</p><p className="data-caption">Source: <a href={`https://rugcheck.xyz/tokens/${encodeURIComponent(mint)}`} target="_blank" rel="noopener noreferrer">RugCheck report</a>{data && !error ? ` · Retrieved ${new Date(data.observedAt).toLocaleTimeString()}` : ""} · Updates every minute</p>
  </section>;
}
