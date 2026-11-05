"use client";
import { SecurityEngine } from "@/components/security-engine";
import { useEffect, useRef, useState } from "react";
import { fromUnits, SOL_MINT, toUnits } from "@/lib/integration-types";
import type { BuiltTransaction, Market, MarketResponse, Order, PoolDetails } from "@/lib/integration-types";
import { rilo, signBuilt, signSwap, confirmSignature } from "@/lib/rilo-client";
import { useWallet } from "@/components/wallet-provider";
import { TokenAvatar } from "@/components/token-avatar";
import { LiquidityStatus } from "@/components/liquidity-status";
import { TokenChart } from "@/components/token-chart";
import { usd } from "@/components/market-feed";
import { WalletIntelligence } from "@/components/wallet-intelligence";

type Quote = { order?: Order; built?: BuiltTransaction | null; router: string; outAmount: string; otherAmountThreshold: string; outputDecimals: number | null; feeBps: number | null; slippageBps: number; expiresAt?: number };
export function MarketTerminal({ mint, decimals, onClose }: { mint: string; decimals?: number; onClose(): void }) {
  const wallet = useWallet(), [markets, setMarkets] = useState<Market[]>([]), [market, setMarket] = useState<Market | null>(null), [pool, setPool] = useState<PoolDetails | null>(null), [marketError, setMarketError] = useState(""), [poolError, setPoolError] = useState("");
  const [side, setSide] = useState("buy"), [amount, setAmount] = useState(""), [slippage, setSlippage] = useState("100"), [quote, setQuote] = useState<Quote | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [signature, setSignature] = useState(""), [now, setNow] = useState(Date.now());
  const quoteRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let timer: number | undefined;
    setMarkets([]); setMarket(null); setMarketError(""); setPool(null); setPoolError("");
    async function loadMarket() {
      try {
        if (!document.hidden) {
          const data = await rilo<MarketResponse>(`market?mint=${encodeURIComponent(mint)}`, undefined, abort.signal);
          if (abort.signal.aborted) return;
          setMarkets(data.markets);
          setMarket(current => data.markets.find(item => item.pool === current?.pool) ?? data.markets[0] ?? null);
          setMarketError(data.markets.length ? "" : "No indexed DEX pool was returned for this token.");
        }
      } catch (e) { if (!abort.signal.aborted) setMarketError(e instanceof Error ? e.message : "Market data unavailable."); }
      finally { if (!abort.signal.aborted) timer = window.setTimeout(loadMarket, 60_000); }
    }
    void loadMarket();
    rilo<{ pool: PoolDetails | null }>(`pool?mint=${mint}`, undefined, abort.signal).then(data => setPool(data.pool)).catch(e => { if (!abort.signal.aborted) setPoolError(e.message); });
    return () => { abort.abort(); window.clearTimeout(timer); quoteRequest.current?.abort(); };
  }, [mint]);
  useEffect(() => { quoteRequest.current?.abort(); setQuote(null); setError(""); }, [mint, side, amount, slippage, wallet.address]);
  useEffect(() => { if (!quote) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [quote]);
  const tokenDecimals = decimals ?? market?.decimals ?? null;
  async function getQuote() {
    setBusy(true); setError(""); setMessage(""); const abort = new AbortController(); quoteRequest.current = abort;
    try {
      if (side === "sell" && tokenDecimals === null) throw new Error("Token decimals could not be verified. Connect the RPC or wait for token metadata before selling.");
      const units = toUnits(amount, side === "buy" ? 9 : tokenDecimals!), walletAddress = wallet.status?.signing && wallet.status?.rpc ? wallet.address : "";
      if (pool && !pool.graduated) {
        const params = new URLSearchParams({ mint, side, amount: units, slippageBps: slippage }); if (walletAddress) params.set("wallet", walletAddress);
        const result = await rilo<Quote>(`curve/order?${params}`, undefined, abort.signal); if (!abort.signal.aborted) setQuote({ ...result, expiresAt: result.built?.expiresAt ?? Date.now() + 40_000 });
      } else {
        const params = new URLSearchParams({ inputMint: side === "buy" ? SOL_MINT : mint, outputMint: side === "buy" ? mint : SOL_MINT, amount: units, slippageBps: slippage }); if (walletAddress && wallet.status?.trading) params.set("wallet", walletAddress);
        const order = await rilo<Order>(`order?${params}`, undefined, abort.signal); if (!abort.signal.aborted) setQuote({ order, router: order.router, outAmount: order.outAmount, otherAmountThreshold: order.otherAmountThreshold, outputDecimals: side === "buy" ? tokenDecimals : 9, feeBps: order.feeBps, slippageBps: order.slippageBps, expiresAt: order.expiresAt ?? Date.now() + 40_000 });
      }
      setNow(Date.now());
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Quote unavailable."); } finally { setBusy(false); }
  }
  async function trade() {
    if (!quote || !wallet.address) return; setBusy(true); setError("");
    try {
      setMessage("Review the swap in Phantom.");
      const result = quote.built ? await signBuilt(quote.built, wallet.address) : await signSwap(quote.order!, wallet.address); setQuote(null);
      if (result.signature) setSignature(result.signature);
      if (result.status === "confirmed") setMessage("Swap confirmed.");
      else if (result.status === "submitted" && result.signature) { setMessage("Submitted. Waiting for confirmation…"); const state = await confirmSignature(result.signature); setMessage(state === "confirmed" ? "Swap confirmed." : state === "failed" ? "Swap failed on-chain." : "Confirmation pending. Check the signature before submitting another trade."); }
      else setMessage("The swap provider reported a failed transaction.");
    } catch (e) { setQuote(null); setError(`${e instanceof Error ? e.message : "Swap not confirmed."} Check your wallet activity before submitting another trade.`); } finally { setBusy(false); }
  }
  const output = (raw: string) => quote?.outputDecimals === null ? `${raw} smallest units` : fromUnits(raw, quote?.outputDecimals ?? 9);
  const executable = Boolean(quote?.built || quote?.order?.transaction && quote.order.ticket);
  return <section className="terminal"><div className="terminal-heading"><div><p className="eyebrow">MARKET TERMINAL</p><div className="terminal-token-title"><TokenAvatar imageUrl={market?.imageUrl} symbol={market?.symbol || "?"} large /><h2>{market?.symbol || `${mint.slice(0,6)}…${mint.slice(-4)}`}</h2></div></div><button className="quiet-button" onClick={onClose}>Explore tokens</button></div>
    <div className="terminal-grid"><div className="panel chart-panel"><div className="market-metrics"><div><span>Price</span><strong>{usd(market?.price ?? null)}</strong></div><div><span>24h volume</span><strong className="white-volume">{usd(market?.volume24h ?? null, true)}</strong></div><div><span>Liquidity</span><strong>{usd(market?.liquidity ?? null, true)}</strong></div></div>{markets.length > 1 && <label className="pool-selector">Market<select value={market?.pool || ""} onChange={e => setMarket(markets.find(item => item.pool === e.target.value) ?? null)}>{markets.map(item => <option key={item.pool} value={item.pool}>{item.dex} · {item.pool.slice(0,6)}… · {usd(item.liquidity, true)}</option>)}</select></label>}
      {market && marketError && <p className="form-note">{marketError} Showing the last successful market snapshot.</p>}
      {market ? <TokenChart pool={market.pool} side={market.tokenSide} /> : <p className="empty-note">{marketError || "Loading market history…"}</p>}<p className="data-caption address">Mint: {mint}</p></div>
      <aside className="panel trade-panel"><div className="segmented"><button disabled={busy} className={side === "buy" ? "selected" : ""} onClick={() => setSide("buy")}>Buy</button><button disabled={busy} className={side === "sell" ? "selected" : ""} onClick={() => setSide("sell")}>Sell</button></div><label>Amount in {side === "buy" ? "SOL" : market?.symbol || "tokens"}<input inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /></label><label>Maximum slippage<select value={slippage} disabled={busy} onChange={e => setSlippage(e.target.value)}><option value="50">0.5%</option><option value="100">1%</option><option value="200">2%</option><option value="500">5%</option></select></label>
        <button className="quiet-button" disabled={busy || !amount} onClick={() => void getQuote()}>{busy ? "Working…" : "Get live quote"}</button>
        {quote && <div className="quote-review"><span className="eyebrow">REVIEW SWAP · {quote.router}</span><p>Expected: <strong>{output(quote.outAmount)}</strong> {side === "buy" ? market?.symbol : "SOL"}</p><p>Minimum: {output(quote.otherAmountThreshold)}</p><p>Slippage: {quote.slippageBps / 100}%{quote.feeBps !== null ? ` · Quoted fee: ${quote.feeBps / 100}%` : " · Protocol fees included"}</p>{quote.built && <p>Network: {quote.built.network}</p>}<p className="subtle">Network fees and rent may apply. {Math.max(0, Math.ceil(((quote.expiresAt ?? 0) - now) / 1000))}s to refresh.</p><button className="metal-button" disabled={busy || !wallet.address || !executable || now > (quote.expiresAt ?? 0)} onClick={() => void trade()}>{!wallet.address ? "Connect wallet to trade" : !executable ? "Trading setup required" : now > (quote.expiresAt ?? 0) ? "Refresh quote" : `Approve ${side} in wallet`}</button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-note" role="status">{message}</p>}{signature && <p className="subtle address">Transaction: {signature}</p>}<p className="subtle">Curve trades use Meteora. DEX trades use Jupiter. A quote does not guarantee execution.</p>
      </aside></div>
    <div className="panel creator-history"><div className="panel-heading"><h3>Creator & launch history</h3><span className="badge">ON-CHAIN RECORDS</span></div>{pool ? <><p className="address subtle">Verified Meteora pool creator: {pool.creator}</p><p className="subtle">{pool.graduated ? "Graduated to a DEX" : `${(pool.progress * 100).toFixed(1)}% of the curve’s graduation reserve`} · Creator fee share: {pool.creatorFeePercent}% of distributable trading fees.</p><p className="subtle">{pool.historyAvailable ? `${pool.history.length} returned Meteora launches by this creator.` : "Creator history is temporarily unavailable."} These records do not establish intent or rug history.</p><div className="creator-launch-list">{pool.history.slice(0,8).map(item => <span className="mono" key={item.pool}>{item.mint.slice(0,6)}…{item.mint.slice(-4)} · {item.graduated ? "Graduated" : "On curve"}</span>)}</div></> : <p className="subtle">{poolError || "No verified Meteora creator record was returned. History on other launch programs remains outside this integration’s coverage."}</p>}</div>
    {market && <LiquidityStatus key={`${mint}:${market.pool}`} mint={mint} pool={market.pool} />}
    <SecurityEngine key={`${mint}:${market?.pool ?? ""}`} mint={mint} pool={market?.pool} />
    <WalletIntelligence key={mint} mint={mint} />
  </section>;
}
