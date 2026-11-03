"use client";

import { useEffect, useRef, useState } from "react";
import { Mark, Star, XIcon } from "@/components/icons";
import { WalletButton } from "@/components/wallet-button";
import { LaunchForm } from "@/components/launch-form";
import { WalletProvider } from "@/components/wallet-provider";
import { MarketFeed } from "@/components/market-feed";
import { MarketTerminal } from "@/components/market-terminal";
import { formatSupply, isSolanaAddress } from "@/lib/token-analysis";
import type { Scan } from "@/lib/token-analysis";

type SavedMint = { mint: string };
type Status = { configured: boolean; connected: boolean; genesisHash?: string };
const WATCH_KEY = "rilo-watchlist-v1";
const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-6)}`;

export function RiloApp() { return <WalletProvider><RiloDashboard /></WalletProvider>; }
function RiloDashboard() {
  const [tab, setTab] = useState<"discover" | "launch">("discover");
  const [mint, setMint] = useState("");
  const [selectedMint, setSelectedMint] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [watch, setWatch] = useState<SavedMint[]>([]);
  const [storageNotice, setStorageNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
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
  async function check(address: string) {
    const value = address.trim();
    if (!isSolanaAddress(value)) { setError("Paste a valid Solana token mint address."); return; }
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setScan(null); setMint(value); setSelectedMint(value); setTab("discover"); setWatchOpen(false);
    try {
      const response = await fetch(`/api/solana/scan?mint=${encodeURIComponent(value)}`, { signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scan could not complete.");
      if (!abort.signal.aborted) { setScan(data); setStatus(current => ({ ...current, configured: true, connected: true })); }
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Scan could not complete. Try again.");
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function copy() {
    if (!scan) return;
    try { await navigator.clipboard.writeText(scan.mint); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setError("Could not copy the address. Select the address to copy it manually."); }
  }

  return <main className="rilo-app">
    <div className="app-ambient" aria-hidden="true"><div className="metal-field"><div className="metal-wave metal-wave-one" /><div className="metal-wave metal-wave-two" /></div></div>
    <header className="app-header"><a href="/" className="brand-mark" aria-label="RILO home"><Mark /></a>
      <nav aria-label="Main navigation"><button className={tab === "discover" ? "nav-tab active" : "nav-tab"} aria-current={tab === "discover" ? "page" : undefined} onClick={() => setTab("discover")}>Discover</button><button className={tab === "launch" ? "nav-tab active" : "nav-tab"} aria-current={tab === "launch" ? "page" : undefined} onClick={() => setTab("launch")}>Launch</button></nav>
      <div className="header-actions"><a className="social-link" href="https://x.com/RiloProtocol" target="_blank" rel="noopener noreferrer" aria-label="RiloProtocol on X"><XIcon /></a><button className="icon-button" aria-label={`Watchlist, ${watch.length} tokens`} onClick={() => setWatchOpen(true)}><Star /></button><WalletButton /></div>
    </header>
    <div className="app-body">
      <div className="app-title-row"><p className="eyebrow">SOLANA LAUNCH INTELLIGENCE</p><span className={`connection-status ${status?.connected ? "connected" : ""}`}><i />{status === null ? "Checking connection" : status.connected ? "RPC connected" : status.configured ? "RPC unavailable" : "RPC setup required"}</span></div>
      {tab === "discover" ? <>
        <section className="app-intro"><div><h1>Read the launch.<br /><span>Before the move.</span></h1><p>Look beneath the ticker. Check token authorities and supply distribution directly from the chain.</p></div><div className="intro-index" aria-hidden="true"><span>R / 01</span><span>OBSERVE. VERIFY.</span></div></section>
        <form className="scan-form" onSubmit={event => { event.preventDefault(); void check(mint); }}><label htmlFor="mint-address" className="sr-only">Solana token mint address</label><span className="scan-symbol" aria-hidden="true">⌕</span><input id="mint-address" value={mint} onChange={event => setMint(event.target.value)} placeholder="Paste a Solana token mint address" autoComplete="off" spellCheck={false} maxLength={44} required /><button className="metal-button" disabled={busy}>{busy ? "Scanning…" : "Analyze token"}</button></form>
        <p className="scan-help">Read-only checks · No wallet required · Uses your configured Solana network</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {storageNotice && <p className="form-note" role="status">{storageNotice}</p>}
        {busy && <div className="scan-progress" role="status"><span />Reading token data from the chain…</div>}
        {selectedMint && <MarketTerminal key={selectedMint} mint={selectedMint} decimals={scan?.info.decimals} onClose={() => { setSelectedMint(""); setScan(null); setError(""); }} />}
        {scan ? <section className="scan-results" aria-label="Token analysis">
          <div className="result-heading"><div><p className="eyebrow">TOKEN ANALYSIS · {scan.program.toUpperCase()}</p><h2 className="mono">{shorten(scan.mint)}</h2></div><div className="result-actions"><button className="quiet-button" onClick={() => void copy()}>{copied ? "Copied" : "Copy address"}</button><button className="icon-button" aria-label={watch.some(item => item.mint === scan.mint) ? "Remove token from watchlist" : "Add token to watchlist"} aria-pressed={watch.some(item => item.mint === scan.mint)} onClick={() => toggleWatch(scan.mint)}><Star filled={watch.some(item => item.mint === scan.mint)} /></button></div></div>
          <p className="coverage-note">Partial coverage. These observations do not establish whether a launch is safe or a rug pull.</p>
          <div className="metric-grid"><div className="metric"><span>Current supply</span><strong className="supply-value">{formatSupply(scan.info.supply, scan.info.decimals)}</strong></div><div className="metric"><span>Top {scan.accounts.length || "—"} token accounts</span><strong>{scan.topAccountsShare === null ? "Unavailable" : `${scan.topAccountsShare.toFixed(2)}%`}</strong></div><div className="metric"><span>Data observed</span><strong>{new Date(scan.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong><small>Slot {scan.slot.toLocaleString()}</small></div></div>
          <div className="analysis-grid"><div className="panel checks-panel"><div className="panel-heading"><h3>Launch intelligence</h3><span className="badge">PARTIAL COVERAGE</span></div><div className="check-list">{scan.checks.map(check => <article className={`check-row ${check.state}`} key={check.title}><span className="check-indicator" aria-hidden="true">{check.state === "attention" ? "!" : check.state === "observed" ? "·" : "—"}</span><div><h4>{check.title}</h4><p>{check.detail}</p></div><span className="check-state">{check.state === "attention" ? "Review" : check.state === "observed" ? "Observed" : "Not checked"}</span></article>)}</div></div>
            <aside className="panel holders-panel"><div className="panel-heading"><h3>Supply distribution</h3></div><p className="subtle">Largest token accounts, not verified wallet owners. Pool and exchange accounts are included.</p>{scan.accounts.length ? <ol className="holder-list">{scan.accounts.map((account, index) => <li key={account.address}><div><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="mono">{shorten(account.address)}</span><strong>{account.share === null ? "—" : `${account.share.toFixed(2)}%`}</strong></div><span className="holder-bar"><i style={{ width: `${Math.min(account.share ?? 0, 100)}%` }} /></span></li>)}</ol> : <p className="empty-note">No largest-account data is available.</p>}<p className="subtle">Authority and account readings are separate RPC snapshots. Balances may change between them.</p></aside>
          </div>
        </section> : !busy && !selectedMint && <div className="discovery-grid"><section className="panel intelligence-panel"><div className="panel-heading"><div><p className="eyebrow">SIGNAL ENGINE</p><h2>Every signal needs evidence.</h2></div><span className="badge">READ ONLY</span></div><div className="engine-art" aria-hidden="true"><div className="engine-orbit orbit-one" /><div className="engine-orbit orbit-two" /><div className="engine-core"><Mark /></div><span className="engine-label label-one">AUTHORITY</span><span className="engine-label label-two">DISTRIBUTION</span><span className="engine-label label-three">ON-CHAIN DATA</span></div><p className="engine-caption">Paste a mint address to inspect the token. Unchecked signals stay visible, so missing data never becomes a clean-launch badge.</p></section><aside className="capabilities"><div className="panel capability-card"><span className="feature-number">01 / OBSERVE</span><h3>Token controls</h3><p>See whether supply can be increased or token accounts can be frozen.</p><span className="feature-state">Available with RPC</span></div><div className="panel capability-card"><span className="feature-number">02 / INSPECT</span><h3>Supply distribution</h3><p>Understand how much supply sits in the largest token accounts.</p><span className="feature-state">Available with RPC</span></div><div className="panel capability-card"><span className="feature-number">03 / CONNECT</span><h3>Wallet relationships</h3><p>Bundle analysis and developer history require launch indexing.</p><span className="feature-state pending">Integration pending</span></div></aside></div>}
        {!selectedMint && <MarketFeed onSelect={value => void check(value)} />}
      </> : <><section className="app-intro compact"><div><h1>Your next launch.<br /><span>In full view.</span></h1><p>Create and save your token profile, then review it before deployment.</p></div></section><LaunchForm /></>}
      <footer className="app-footer"><span className="powered-by">POWERED BY RILO</span><span>On-chain observations. Transparent coverage.</span><a href="https://x.com/RiloProtocol" target="_blank" rel="noopener noreferrer">@RiloProtocol</a></footer>
    </div>
    <dialog ref={watchDialog} className="rilo-dialog" onCancel={() => setWatchOpen(false)} onClick={event => { if (event.target === event.currentTarget) setWatchOpen(false); }} aria-labelledby="watchlist-title"><button className="dialog-close" aria-label="Close watchlist" onClick={() => setWatchOpen(false)}>×</button><p className="eyebrow">YOUR TOKENS</p><h2 id="watchlist-title">Watchlist</h2><p className="subtle">Saved on this device. Select a token to run a fresh check.</p>{watch.length ? <ul className="watch-list">{watch.map(item => <li key={item.mint}><button className="quiet-button mono" onClick={() => void check(item.mint)}>{shorten(item.mint)}</button><button className="icon-button" aria-label={`Remove ${shorten(item.mint)} from watchlist`} onClick={() => toggleWatch(item.mint)}><Star filled /></button></li>)}</ul> : <p className="empty-note">Analyze a token and tap its star to save it here.</p>}</dialog>
  </main>;
}
