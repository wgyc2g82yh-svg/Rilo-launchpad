"use client";
import { SecurityEngine } from "@/components/security-engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { fromUnits, SOL_MINT, toUnits } from "@/lib/integration-types";
import type { BuiltTransaction, Market, MarketResponse, Order, PoolDetails } from "@/lib/integration-types";
import { ApiError, rilo, signBuilt, signSwap, confirmSignature } from "@/lib/rilo-client";
import { useWallet } from "@/components/wallet-provider";
import { TokenAvatar } from "@/components/token-avatar";
import { TokenChart } from "@/components/token-chart";
import { LiquidityLockBadge } from "@/components/liquidity-lock-badge";
import type { LiquidityEvidence } from "@/lib/liquidity-evidence";
import { MarketCapValue } from "@/components/market-cap-value";
import { applyQuotes, LIVE_QUOTE_REFRESH_MS, mergeMarket } from "@/lib/market-feed-data";
import { usd } from "@/components/market-feed";

type Quote = { order?: Order; built?: BuiltTransaction | null; router: string; outAmount: string; otherAmountThreshold: string; outputDecimals: number | null; feeBps: number | null; slippageBps: number; expiresAt?: number };
export function MarketTerminal({ mint, decimals, initialMarket = null, onClose }: { mint: string; initialMarket?: Market | null; decimals?: number; onClose(): void }) {
  const wallet = useWallet(), [markets, setMarkets] = useState<Market[]>([]), [market, setMarket] = useState<Market | null>(initialMarket), [pool, setPool] = useState<PoolDetails | null>(null), [marketError, setMarketError] = useState(""), [poolError, setPoolError] = useState("");
  const [side, setSide] = useState("buy"), [amount, setAmount] = useState(""), [slippage, setSlippage] = useState("100"), [quote, setQuote] = useState<Quote | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [signature, setSignature] = useState(""), [now, setNow] = useState(Date.now());
  const [liquidity, setLiquidity] = useState<LiquidityEvidence | null>(null), [liquidityChecked, setLiquidityChecked] = useState(false);
  const receiveLiquidity = useCallback((evidence: LiquidityEvidence | null, checked: boolean) => { setLiquidity(evidence); setLiquidityChecked(checked); }, []);
  const [quoteUpdateError, setQuoteUpdateError] = useState("");
  const [showVolume, setShowVolume] = useState(false);
  const [holders, setHolders] = useState<number | null>(null);
  const quoteRequest = useRef<AbortController | null>(null);
  const terminalRef = useRef<HTMLElement | null>(null);
  useEffect(() => { terminalRef.current?.scrollIntoView({ behavior: "instant", block: "start" }); }, [mint]);
  useEffect(() => {
    const abort = new AbortController();
    let timer: number | undefined, marketBusy = false, retryMs = 30_000;
    setMarkets(initialMarket ? [initialMarket] : []); setMarket(initialMarket); setMarketError(""); setPool(null); setPoolError("");
    async function loadMarket() {
      if (abort.signal.aborted || marketBusy) return;
      marketBusy = true; window.clearTimeout(timer);
      try {
        if (!document.hidden) {
          const data = await rilo<MarketResponse>(`market?mint=${encodeURIComponent(mint)}`, undefined, abort.signal);
          if (abort.signal.aborted) return;
          retryMs = data.stale || data.partial ? 60_000 : data.refreshMs ?? 30_000;
          setHolders(data.totalHolders ?? null);
          if (data.markets.length) setMarkets(current => data.markets.map(item => mergeMarket(current.find(previous => previous.pool === item.pool), item)));
          setMarket(current => { const next = data.markets.find(item => item.pool === current?.pool) ?? data.markets[0]; return next ? mergeMarket(current ?? undefined, next) : current; });
          setMarketError(!data.markets.length ? "No indexed DEX pool was returned for this token." : data.stale ? `Updates delayed · Last update ${new Date(data.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · Retrying automatically` : data.partial ? "Limited market coverage · Retrying automatically" : "");
        }
      } catch (e) { retryMs = e instanceof ApiError ? Math.max(30_000, e.retryAfterMs) : 60_000; if (!abort.signal.aborted) setMarketError(e instanceof Error ? e.message : "Market data unavailable."); }
      finally { marketBusy = false; if (!abort.signal.aborted && !document.hidden) timer = window.setTimeout(loadMarket, retryMs); }
    }
    const visibility = () => { if (document.hidden) window.clearTimeout(timer); else void loadMarket(); };
    document.addEventListener("visibilitychange", visibility);
    void loadMarket();
    rilo<{ pool: PoolDetails | null }>(`pool?mint=${mint}`, undefined, abort.signal).then(data => setPool(data.pool)).catch(e => { if (!abort.signal.aborted) setPoolError(e.message); });
    return () => { abort.abort(); document.removeEventListener("visibilitychange", visibility); window.clearTimeout(timer); quoteRequest.current?.abort(); };
  }, [mint, initialMarket]);
  useEffect(() => {
    const abort = new AbortController(); let timer: number | undefined, busy = false, notBefore = 0;
    setQuoteUpdateError("");
    async function update() {
      if (abort.signal.aborted || busy) return;
      window.clearTimeout(timer);
      if (document.hidden) return;
      if (Date.now() < notBefore) { timer = window.setTimeout(update, notBefore - Date.now()); return; }
      busy = true;
      try {
        const data = await rilo<MarketResponse>(`market/quotes?mints=${mint}`, undefined, abort.signal);
        if (abort.signal.aborted) return;
        setMarkets(current => current.length ? applyQuotes(current, data.markets) : data.markets);
        setMarket(current => current ? applyQuotes([current], data.markets)[0] : data.markets[0] ?? null);
        setQuoteUpdateError("");
      } catch (error) {
        if (!abort.signal.aborted) {
          notBefore = Date.now() + Math.max(LIVE_QUOTE_REFRESH_MS, error instanceof ApiError ? error.retryAfterMs : 20_000);
          setQuoteUpdateError("Quote updates delayed · Retrying automatically");
        }
      } finally { busy = false; if (!abort.signal.aborted && !document.hidden) timer = window.setTimeout(update, Math.max(LIVE_QUOTE_REFRESH_MS, notBefore - Date.now())); }
    }
    const resume = () => { if (document.hidden) window.clearTimeout(timer); else void update(); };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    void update();
    return () => { abort.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
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
  return <section className="terminal" ref={terminalRef}><div className="terminal-heading"><div><p className="eyebrow">TOKEN INTELLIGENCE</p><div className="terminal-token-title"><TokenAvatar imageUrl={market?.imageUrl} fallbackImageUrl={market?.fallbackImageUrl} symbol={market?.symbol || "?"} large /><h2>{market?.symbol || `${mint.slice(0,6)}…${mint.slice(-4)}`}</h2></div></div><button className="quiet-button" onClick={onClose}>Explore tokens</button></div>
    <div className="terminal-grid"><div className="panel chart-panel"><div className="market-metrics"><div><span>Price</span><strong>{usd(market?.price ?? null)}</strong></div><button type="button" className="metric-toggle" onClick={() => setShowVolume(value => !value)} aria-label={showVolume ? 'Show market cap' : 'Show 24h volume'}><span>{showVolume ? '24h volume' : market?.marketCapKind === 'fdv' ? 'Est. cap (FDV)' : 'Market cap'} ⇄</span><strong>{showVolume ? usd(market?.volume24h ?? null, true) : <MarketCapValue market={market} />}</strong></button><div><span>Liquidity</span><strong>{usd(market?.liquidity ?? null, true)}</strong><LiquidityLockBadge evidence={liquidity?.pool === market?.pool ? liquidity : null} checked={liquidityChecked} /></div><div><span>Holders</span><strong>{holders?.toLocaleString() ?? "—"}</strong></div></div>{markets.length > 1 && <label className="pool-selector">Market<select value={market?.pool || ""} onChange={e => setMarket(markets.find(item => item.pool === e.target.value) ?? null)}>{markets.map(item => <option key={item.pool} value={item.pool}>{item.dex} · {item.pool.slice(0,6)}… · {usd(item.liquidity, true)}</option>)}</select></label>}
      {market && quoteUpdateError && <p className="market-update-note" role="status">{quoteUpdateError}</p>}
      {market && marketError && <p className="market-update-note" role="status">{marketError}</p>}
      {market ? <TokenChart mint={mint} pool={market.pool} side={market.tokenSide} /> : <p className="empty-note">{marketError || "Loading market history…"}</p>}<p className="data-caption address">Mint: {mint}</p></div>
      <aside className="panel trade-panel"><div className="segmented"><button disabled={busy} className={side === "buy" ? "selected" : ""} onClick={() => setSide("buy")}>Buy</button><button disabled={busy} className={side === "sell" ? "selected" : ""} onClick={() => setSide("sell")}>Sell</button></div><label>Amount in {side === "buy" ? "SOL" : market?.symbol || "tokens"}<input inputMode="decimal" placeholder="0.00" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} /></label><label>Maximum slippage<select value={slippage} disabled={busy} onChange={e => setSlippage(e.target.value)}><option value="50">0.5%</option><option value="100">1%</option><option value="200">2%</option><option value="500">5%</option></select></label>
        <button className="quiet-button" disabled={busy || !amount} onClick={() => void getQuote()}>{busy ? "Working…" : "Get live quote"}</button>
        {quote && <div className="quote-review"><span className="eyebrow">REVIEW SWAP · {quote.router}</span><p>Expected: <strong>{output(quote.outAmount)}</strong> {side === "buy" ? market?.symbol : "SOL"}</p><p>Minimum: {output(quote.otherAmountThreshold)}</p><p>Slippage: {quote.slippageBps / 100}%{quote.feeBps !== null ? ` · Quoted fee: ${quote.feeBps / 100}%` : " · Protocol fees included"}</p>{quote.built && <p>Network: {quote.built.network}</p>}<p className="subtle">Network fees and rent may apply. {Math.max(0, Math.ceil(((quote.expiresAt ?? 0) - now) / 1000))}s to refresh.</p><button className="metal-button" disabled={busy || !wallet.address || !executable || now > (quote.expiresAt ?? 0)} onClick={() => void trade()}>{!wallet.address ? "Connect wallet to trade" : !executable ? "Trading setup required" : now > (quote.expiresAt ?? 0) ? "Refresh quote" : `Approve ${side} in wallet`}</button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-note" role="status">{message}</p>}{signature && <p className="subtle address">Transaction: {signature}</p>}<p className="subtle">Curve trades use Meteora. DEX trades use Jupiter. A quote does not guarantee execution.</p>
      </aside></div>
    <SecurityEngine mint={mint} pool={market?.pool} onLiquidity={receiveLiquidity} />
  </section>;
}
