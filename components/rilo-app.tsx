"use client";
import type { Market } from "@/lib/integration-types";

import { useEffect, useRef, useState } from "react";
import { OriginalBackground, OriginalBrand, OriginalHero, OriginalIcon } from "@/components/original-brand";
import { Star, XIcon } from "@/components/icons";
import { WalletButton } from "@/components/wallet-button";
import { LaunchForm } from "@/components/launch-form";
import { WalletProvider } from "@/components/wallet-provider";
import { MarketFeed } from "@/components/market-feed";
import { MarketTerminal } from "@/components/market-terminal";
import { formatSupply, isSolanaAddress } from "@/lib/token-analysis";
import type { Scan } from "@/lib/token-analysis";

const NAV = [{name:"Home",icon:"home"},{name:"Discover",icon:"compass"},{name:"Launch",icon:"launch"},{name:"Signals",icon:"pulse"},{name:"Watchlist",icon:"star"},{name:"Activity",icon:"activity"}] as const;
type View = "discover" | "launch" | "signals" | "activity" | "home";
type SavedMint = { mint: string };
type Status = { configured: boolean; connected: boolean; genesisHash?: string };
const WATCH_KEY = "rilo-watchlist-v1";
const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-6)}`;

export function RiloApp() { return <WalletProvider><RiloDashboard /></WalletProvider>; }
function RiloDashboard() {
  const [tab, setTab] = useState<View>("home");
  const [mint, setMint] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedMint, setSelectedMint] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [watch, setWatch] = useState<SavedMint[]>([]);
  const [storageNotice, setStorageNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [activity, setActivity] = useState<{mint:string;time:string}[]>([]);
  const technologySection = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const watchDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/solana/status", { signal: abort.signal }).then(response => response.json()).then(setStatus).catch(() => {});
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(WATCH_KEY) ?? "[]");
      if (Array.isArray(raw)) setWatch(raw.filter((item): item is SavedMint => typeof item?.mint === "string" && isSolanaAddress(item.mint)).slice(0, 50));
    } catch { setStorageNotice("Your watchlist could not be restored on this device."); }
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => { if (watchOpen) watchDialog.current?.showModal(); else watchDialog.current?.close(); }, [watchOpen]);

  function toggleWatch(address: string) {
    const next = watch.some(item => item.mint === address) ? watch.filter(item => item.mint !== address) : [...watch, { mint: address }].slice(-50);
    setWatch(next);
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(next)); setStorageNotice(""); }
    catch { setStorageNotice("Browser storage is unavailable. This watchlist will last for this session."); }
  }
  async function check(address: string, market: Market | null = null) {
    const value = address.trim();
    if (!isSolanaAddress(value)) { setError("Paste a valid Solana token mint address."); return; }
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setScan(null); setMint(value); setSelectedMarket(market); setSelectedMint(value); setTab("discover"); setWatchOpen(false);
    try {
      const response = await fetch(`/api/solana/scan?mint=${encodeURIComponent(value)}`, { signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan could not complete.");
      if (!abort.signal.aborted) { setScan(data); setActivity(items=>[{mint:value,time:data.checkedAt},...items].slice(0,20)); setStatus(current => ({ ...current, configured: true, connected: true })); }
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Scan could not complete. Try again.");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function copy() {
    if (!scan) return;
    try { await navigator.clipboard.writeText(scan.mint); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setError("Could not copy the address. Select the address to copy it manually."); }
  }

  function navigate(name: string) {
    if (name === "Watchlist") { setWatchOpen(true); return; }
    setTab(name.toLowerCase() as View); setSelectedMint(""); setScan(null); setError("");
    window.scrollTo({top:0,behavior:"instant"});
  }
  const tokenSearch = (<form className="scan-form" onSubmit={event => { event.preventDefault(); void check(mint); }}><label htmlFor="mint-address" className="sr-only">Solana token mint address</label><span className="scan-symbol" aria-hidden="true">⌕</span><input id="mint-address" value={mint} onChange={event => setMint(event.target.value)} placeholder="Paste a Solana token mint address" autoComplete="off" spellCheck={false} maxLength={44} required /><button className="metal-button" disabled={busy}>{busy ? "Scanning…" : "Analyze token"}</button></form>);
  const navigation = (mobile: boolean) => <nav className={mobile ? "rt-mobile-nav" : "rt-desktop-nav"} aria-label={mobile ? "Mobile" : "Main navigation"}>{NAV.map(item=><button key={item.name} className={tab===item.name.toLowerCase() ? "rt-active" : ""} aria-current={tab===item.name.toLowerCase() ? "page" : undefined} onClick={()=>navigate(item.name)}>{mobile && <OriginalIcon name={item.icon} size={21}/>}<span>{item.name}</span></button>)}</nav>;
  return <main id="rt" className="rilo-app">
    <OriginalBackground />
    <header className="rt-header"><div className="rt-header-inner">
      <button className="rt-home" onClick={()=>navigate("Home")} aria-label="RILO home"><OriginalBrand/></button>
      {navigation(false)}
      <div className="rt-header-actions"><a className="rt-social" href="https://x.com/RiloProtocol" target="_blank" rel="noopener noreferrer" aria-label="RiloProtocol on X"><XIcon/></a><span className="rt-chain"><span>◎</span> SOLANA</span><WalletButton/></div>
    </div></header>
    <div className="rt-container">

      {tab === "home" ? <OriginalHero onExplore={()=>navigate("Discover")} onTechnology={()=>navigate("Signals")}/> : tab === "discover" || tab === "signals" ? <>
        {tab === "signals" && <section className="app-intro"><div><p className="eyebrow">THE SIGNAL ENGINE</p><h1>Look beneath<br/><span>the launch.</span></h1><p>Inspect token controls, supply concentration, and public wallet evidence. Missing coverage stays visible.</p></div></section>}
        <div className="rilo-live-content" ref={technologySection}>
        <div className="app-title-row"><p className="eyebrow">ON-CHAIN INTELLIGENCE</p><span className={`connection-status ${status?.connected ? "connected" : ""}`}><i />{status === null ? "Checking connection" : status.connected ? "RPC connected" : status.configured ? "RPC unavailable" : "RPC setup required"}</span></div>
        {(selectedMint || tab === "signals") && tokenSearch}
        {error && <p className="form-error" role="alert">{error}</p>}
        {storageNotice && <p className="form-note" role="status">{storageNotice}</p>}
        {busy && <div className="scan-progress" role="status"><span />Reading token data from the chain…</div>}
        {!selectedMint && tab !== "signals" && <div id="rt-launches"><MarketFeed key={tab} search={tokenSearch} onSelect={market => void check(market.mint, market)} /></div>}
        {selectedMint && <MarketTerminal key={selectedMint} mint={selectedMint} initialMarket={selectedMarket} decimals={scan?.info.decimals} onClose={() => { setSelectedMint(""); setScan(null); setError(""); }} />}
        {scan ? <details className="coin-raw-details"><summary>Token address & raw snapshot</summary><section className="scan-results" aria-label="Token analysis">
          <div className="result-heading"><div><p className="eyebrow">TOKEN ANALYSIS · {scan.program.toUpperCase()}</p><h2 className="mono">{shorten(scan.mint)}</h2></div><div className="result-actions"><button className="quiet-button" onClick={() => void copy()}>{copied ? "Copied" : "Copy address"}</button><button className="icon-button" aria-label={watch.some(item => item.mint === scan.mint) ? "Remove token from watchlist" : "Add token to watchlist"} aria-pressed={watch.some(item => item.mint === scan.mint)} onClick={() => toggleWatch(scan.mint)}><Star filled={watch.some(item => item.mint === scan.mint)} /></button></div></div>
          <p className="coverage-note">Partial coverage. These observations do not establish whether a launch is safe or a rug pull.</p>
          <div className="metric-grid"><div className="metric"><span>Current supply</span><strong className="supply-value">{formatSupply(scan.info.supply, scan.info.decimals)}</strong></div><div className="metric"><span>Top {scan.accounts.length || "—"} token accounts</span><strong>{scan.topAccountsShare === null ? "Unavailable" : `${scan.topAccountsShare.toFixed(2)}%`}</strong></div><div className="metric"><span>Data observed</span><strong>{new Date(scan.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong><small>Slot {scan.slot.toLocaleString()}</small></div></div>
          <div className="analysis-grid"><div className="panel checks-panel"><div className="panel-heading"><h3>Launch intelligence</h3><span className="badge">PARTIAL COVERAGE</span></div><div className="check-list">{scan.checks.slice(0, 4).map(check => <article className={`check-row ${check.state}`} key={check.title}><span className="check-indicator" aria-hidden="true">{check.state === "attention" ? "!" : check.state === "observed" ? "·" : "—"}</span><div><h4>{check.title}</h4><p>{check.detail}</p></div><span className="check-state">{check.state === "attention" ? "Review" : check.state === "observed" ? "Observed" : "Not checked"}</span></article>)}</div></div>
            <aside className="panel holders-panel"><div className="panel-heading"><h3>Supply distribution</h3></div><p className="subtle">Largest token accounts, not verified wallet owners. Pool and exchange accounts are included.</p>{scan.accounts.length ? <ol className="holder-list">{scan.accounts.map((account, index) => <li key={account.address}><div><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="mono">{shorten(account.address)}</span><strong>{account.share === null ? "—" : `${account.share.toFixed(2)}%`}</strong></div><span className="holder-bar"><i style={{ width: `${Math.min(account.share ?? 0, 100)}%` }} /></span></li>)}</ol> : <p className="empty-note">No largest-account data is available.</p>}<p className="subtle">Authority and account readings are separate RPC snapshots. Balances may change between them.</p></aside>
          </div>
        </section></details> : tab === "signals" && !busy && !selectedMint && <div className="discovery-grid"><section className="panel intelligence-panel"><div className="panel-heading"><div><p className="eyebrow">SIGNAL ENGINE</p><h2>Every signal needs evidence.</h2></div><span className="badge">READ ONLY</span></div><div className="engine-art" aria-hidden="true"><div className="engine-orbit orbit-one" /><div className="engine-orbit orbit-two" /><div className="engine-core"><OriginalBrand size={74}/></div><span className="engine-label label-one">AUTHORITY</span><span className="engine-label label-two">DISTRIBUTION</span><span className="engine-label label-three">ON-CHAIN DATA</span></div><p className="engine-caption">Paste a mint address to inspect the token. Unchecked signals stay visible, so missing data never becomes a clean-launch badge.</p></section><aside className="capabilities"><div className="panel capability-card"><span className="feature-number">01 / OBSERVE</span><h3>Token controls</h3><p>See whether supply can be increased or token accounts can be frozen.</p><span className="feature-state">Available with RPC</span></div><div className="panel capability-card"><span className="feature-number">02 / INSPECT</span><h3>Supply distribution</h3><p>Understand how much supply sits in the largest token accounts.</p><span className="feature-state">Available with RPC</span></div><div className="panel capability-card"><span className="feature-number">03 / CONNECT</span><h3>Wallet relationships</h3><p>Bundle analysis and developer history require launch indexing.</p><span className="feature-state pending">Integration pending</span></div></aside></div>}

        </div>
      </> : tab === "activity" ? <section className="rilo-live-content activity-view"><p className="eyebrow">SIGNAL ACTIVITY</p><h1>Your latest intelligence.</h1><p className="subtle">Completed token checks from this session. Market browsing is not a safety verdict.</p>{activity.length ? activity.map((item,i)=><button className="panel activity-item" key={item.mint+item.time+i} onClick={()=>void check(item.mint)}><span className="mono">{shorten(item.mint)}</span><span>{new Date(item.time).toLocaleTimeString()}</span></button>) : <div className="panel empty-note">No completed token checks yet.</div>}</section> : <div className="rilo-live-content"><section className="app-intro compact"><div><h1>Your next launch.<br /><span>In full view.</span></h1><p>Create and save your token profile, then review it before deployment.</p></div></section><LaunchForm /></div>}
      <footer className="app-footer"><span className="powered-by">POWERED BY RILO</span><span>On-chain observations. Transparent coverage.</span><a href="https://x.com/RiloProtocol" target="_blank" rel="noopener noreferrer">@RiloProtocol</a></footer>
    </div>
    {navigation(true)}
    <dialog ref={watchDialog} className="rilo-dialog" onCancel={() => setWatchOpen(false)} onClick={event => { if (event.target === event.currentTarget) setWatchOpen(false); }} aria-labelledby="watchlist-title"><button className="dialog-close" aria-label="Close watchlist" onClick={() => setWatchOpen(false)}>×</button><p className="eyebrow">YOUR TOKENS</p><h2 id="watchlist-title">Watchlist</h2><p className="subtle">Saved on this device. Select a token to run a fresh check.</p>{watch.length ? <ul className="watch-list">{watch.map(item => <li key={item.mint}><button className="quiet-button mono" onClick={() => void check(item.mint)}>{shorten(item.mint)}</button><button className="icon-button" aria-label={`Remove ${shorten(item.mint)} from watchlist`} onClick={() => toggleWatch(item.mint)}><Star filled /></button></li>)}</ul> : <p className="empty-note">Analyze a token and tap its star to save it here.</p>}</dialog>
  </main>;
}
