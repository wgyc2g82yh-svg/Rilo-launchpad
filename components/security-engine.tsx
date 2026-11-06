"use client";
import { useEffect, useRef, useState } from 'react';
import { Network, OriginalIcon } from '@/components/original-brand';
import { rilo } from '@/lib/rilo-client';
import { newRiskAlerts } from '@/lib/security-report';
import type { SecurityCheck, SecurityReport } from '@/lib/security-report';

const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-4)}`;
function SignalIcon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">{kind === 'bundles' ? <><path d="m10 14 4-4M9 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></> : kind === 'concentration' ? <path d="M5 19V9m7 10V4m7 15v-8" /> : kind === 'liquidity' ? <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></> : kind === 'controls' ? <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></> : <><path d="m12 3 10 17H2zM12 9v5m0 2v1" /></>}</svg>;
}
function WalletGraph({ report }: { report: SecurityReport | null }) {
  const flagged = report?.checks.some(check => check.id === 'bundles' && check.state === 'attention');
  return <div className="rt-engine-visual">
    <Network danger={flagged}/>
    <div className="rt-engine-legend"><span><i/> FUNDING PATH</span><span><i/> WALLET</span><span>SUPPLY / HISTORY</span></div>
  </div>;
}

const primaryChecks = [
  { title: 'Bundle detection', ids: ['bundles', 'funding'], icon: 'link', pending: 'Tracing common funding and purchase timing…' },
  { title: 'Developer history', ids: ['creator', 'rugs'], icon: 'warning', pending: 'Reviewing previous launch activity…' },
  { title: 'Holder concentration', ids: ['concentration'], icon: 'activity', pending: 'Mapping the distribution of supply…' },
] as const;

function LiveFindings({ report, busy }: { report: SecurityReport | null; busy: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!report) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(3); return; }
    const timers = [0, 220, 440].map((delay, index) => window.setTimeout(() => setShown(index + 1), delay));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [report]);
  const rows = primaryChecks.map((row, index) => {
    const checks = row.ids.map(id => report?.checks.find(check => check.id === id));
    const flagged = checks.find(check => check?.state === 'attention');
    const status = (!report && busy) || (report && index >= shown) ? 'pending' : flagged ? 'flagged' : checks.every(check => check?.state === 'observed') ? 'clear' : checks.some(check => check?.state === 'observed') ? 'partial' : 'unavailable';
    const detail = status === 'pending' ? row.pending : (flagged ?? checks.find(check => check?.state === 'unknown') ?? checks[0])?.detail ?? 'Evidence unavailable.';
    return { ...row, status, detail };
  });
  const scanning = rows.some(row => row.status === 'pending');
  const flag = [rows[1], rows[0], rows[2]].find(row => row.status === 'flagged');
  const resolved = rows.filter(row => row.status === 'clear' || row.status === 'flagged').length;
  const verdict = scanning ? 'TRACING THE LAUNCH' : flag ? flag.title.toUpperCase() + ' FLAG' : resolved === 3 ? 'NO FLAGS IN SAMPLE' : 'PARTIAL COVERAGE';
  return <>
    <div className="rt-engine-stats"><div><small>SAMPLED WALLETS</small><strong>{report?.wallets?.sampledWallets ?? '—'}</strong></div><div><small>LINKED SUPPLY</small><strong>{report?.linkedSupplyPercent != null ? report.linkedSupplyPercent.toFixed(2) + '%' : '—'}</strong></div><div><small>CHECKS RESOLVED</small><strong>{resolved}<span> / 3</span></strong></div></div>
    <div className="rt-engine-checks">{rows.map(row => <div key={row.title} className={'rt-engine-check rt-check-' + row.status}>
      <span className="rt-engine-check-icon"><OriginalIcon name={row.icon} size={15}/></span>
      <div><strong>{row.title}</strong><p>{row.detail}</p></div>
      <span className="rt-engine-check-state"><OriginalIcon name={row.status === 'flagged' ? 'warning' : row.status === 'clear' ? 'check' : 'pulse'} size={13}/><small>{row.status === 'pending' ? 'SCAN' : row.status === 'flagged' ? 'FLAG' : row.status === 'clear' ? 'CHECKED' : row.status === 'partial' ? 'PARTIAL' : 'NO DATA'}</small></span>
    </div>)}</div>
    <div role="status" className={'rt-engine-verdict rt-verdict-' + (scanning ? 'pending' : flag ? 'flagged' : resolved === 3 ? 'clear' : 'unavailable')}><OriginalIcon name={flag && !scanning ? 'warning' : 'pulse'} size={17}/><div><small>RILO SIGNAL</small><strong>{verdict}</strong></div><div className="rt-bars" aria-hidden="true">{Array.from({length:12}, (_, i) => <i key={i} style={{height:5+(i*7)%19}}/>)}</div></div>
  </>;
}

function SignalRows({ report, busy }: { report: SecurityReport | null; busy: boolean }) {
  const definitions = [
    { id: 'bundles', title: 'Bundle signals', ids: ['funding', 'bundles'] },
    { id: 'creator', title: 'Developer history', ids: ['creator', 'rugs'] },
    { id: 'concentration', title: 'Holder concentration', ids: ['concentration'] },
    { id: 'controls', title: 'Token controls', ids: ['mint', 'freeze', 'extensions'] },
    { id: 'liquidity', title: 'Liquidity lock', ids: ['liquidity'] },
    { id: 'provider', title: 'Rug reports', ids: ['provider'] },
  ];
  return <div className="coin-signal-rows">{definitions.map(row => {
    const checks = row.ids.map(id => report?.checks.find(check => check.id === id)).filter((check): check is SecurityCheck => Boolean(check));
    const state = checks.some(check => check.state === 'attention') ? 'attention' : checks.length === row.ids.length && checks.every(check => check.state === 'observed') ? 'observed' : 'unknown';
    const description = !report ? busy ? 'Reading available evidence…' : 'Evidence unavailable' : row.id === 'bundles' ? !report.wallets ? 'Wallet evidence unavailable' : `${report.wallets?.sharedFunding.length ?? 0} shared sender groups · ${report.wallets?.accumulation?.length ?? 0} same-slot groups${report.wallets ? ' · sampled' : ' · no coverage'}` : row.id === 'creator' ? report.history ? `${report.history.checked}/${report.history.sampled} other launch reports checked` : report.developer ? `${report.developer.source} creator found · rug history incomplete` : 'Creator history unavailable' : row.id === 'concentration' ? checks[0]?.state === 'unknown' ? 'Largest-account data unavailable' : checks[0]?.detail.split('. Accounts')[0] ?? 'Largest token accounts · sampled' : row.id === 'controls' ? state === 'attention' ? 'Supply or transfer controls need review' : state === 'unknown' ? 'Some transfer behavior remains unchecked' : 'Mint and freeze authorities revoked' : row.id === 'liquidity' ? report.liquidity?.status === 'locked' ? 'Provider reports tracked LP locked or burned' : report.liquidity?.status === 'partial' ? 'Tracked LP is partially locked' : report.liquidity?.status === 'unlocked' ? 'Provider reports tracked LP unlocked' : 'Lock evidence unavailable' : report.provider?.rugged === true ? 'RugCheck flags this token as rugged' : report.provider ? `${report.provider.risks.filter(risk => risk.level !== 'info').length} RugCheck warnings · provider report` : 'Provider report unavailable';
    return <details className={`coin-signal-row security-${state}`} key={row.id}><summary><span className="signal-icon"><SignalIcon kind={row.id} /></span><span className="signal-row-copy"><strong>{row.title}</strong><small>{description}</small></span><span className="signal-row-state">{!report && busy ? 'Reading' : state === 'attention' ? 'Review' : state === 'observed' ? 'Observed' : 'Unknown'}</span></summary><div className="signal-row-detail">{checks.length ? checks.map(check => <p key={check.id}><strong>{check.title}</strong> — {check.detail}</p>) : <p>No completed evidence available.</p>}</div></details>;
  })}</div>;
}

export function SecurityEngine({ mint, pool }: { mint: string; pool?: string }) {
  const [monitor, setMonitor] = useState(true), [report, setReport] = useState<SecurityReport | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [revision, setRevision] = useState(0), [alerts, setAlerts] = useState<string[]>([]);
  const baseline = useRef<{ key: string; report: SecurityReport | null }>({ key: '', report: null });
  useEffect(() => {
    const key = `${mint}:${pool ?? ''}`;
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let loading = false;
    if (baseline.current.key !== key) { baseline.current = { key, report: null }; setReport(null); setAlerts([]); }
    setError(''); setBusy(true);
    async function load() {
      if (loading || abort.signal.aborted) return;
      clearTimeout(timer);
      if (document.hidden) { setBusy(false); return; }
      loading = true; setBusy(true);
      try {
        const next = await rilo<SecurityReport>(`security?${new URLSearchParams({ mint, ...(pool ? { pool } : {}) })}`, undefined, abort.signal);
        if (abort.signal.aborted) return;
        if (baseline.current.report) {
          const fresh = newRiskAlerts(baseline.current.report, next);
          if (fresh.length) setAlerts(current => [...fresh.map(check => `${new Date(next.checkedAt).toLocaleTimeString()} · ${check.title}: ${check.detail}`), ...current].slice(0, 10));
        }
        baseline.current = { key, report: next }; setReport(next); setError('');
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Security checks unavailable.'); }
      finally { loading = false; if (!abort.signal.aborted) { setBusy(false); if (monitor && !document.hidden) timer = setTimeout(load, 60_000); } }
    }
    const onVisibility = () => { if (document.hidden) clearTimeout(timer); else if (monitor || !baseline.current.report) void load(); };
    document.addEventListener('visibilitychange', onVisibility);
    void load();
    return () => { abort.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [mint, pool, monitor, revision]);
  const holders = report?.topHolders ?? [];
  const combined = holders.every(holder => holder.share != null) ? Math.min(100,holders.reduce((sum,holder) => sum + (holder.share ?? 0),0)) : null;
  return <section className="panel security-engine coin-signal-card" aria-label="Token signal engine" aria-busy={busy}>
    <div className="signal-card-top"><p className="eyebrow">SIGNAL ENGINE</p><span className="signal-source">{busy ? '● CHECKING' : error ? 'CHECK FAILED' : monitor ? '● AUTO-CHECK ON' : 'PAUSED'}</span></div>
    <div className="signal-card-heading"><div><h3>{report?.verdict === 'attention' ? 'Risk signals observed' : busy && !report ? 'Reading the token' : report ? 'Partial analysis' : 'Analysis unavailable'}</h3><p>{report ? `Updated ${new Date(report.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · slot ${report.slot.toLocaleString()}` : 'On-chain controls · public wallet evidence'}</p></div><button className="quiet-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? 'Reading…' : 'Refresh'}</button></div>
    {error && <p className="form-error" role="alert">{error}{report ? ' Showing an older snapshot; it may be stale.' : ''}</p>}
    <WalletGraph report={report} />
    {report?.developer && <p className="subtle">Creator · <a href={'https://solscan.io/account/' + report.developer.wallet} target="_blank" rel="noopener noreferrer">{short(report.developer.wallet)}</a> · {report.developer.source === 'Meteora' ? 'on-chain Meteora record' : 'RugCheck attribution'}{report.history ? ` · ${report.history.totalKnown} other indexed tokens · ${report.history.checked}/${report.history.sampled} risk reports checked` : ' · history unavailable'}</p>}
    <LiveFindings key={mint + ':' + (pool ?? '')} report={report} busy={busy}/>
    <details className="holder-card">
      <summary><span className="holder-mark" aria-hidden="true">▥</span><strong>Top 10 holders</strong><span className="holder-chevron" aria-hidden="true">⌄</span></summary>
      {holders.length ? <>
        <div className="holder-overview"><small>SUPPLY HELD BY LISTED WALLETS</small><strong>{combined == null ? '—' : combined.toFixed(2) + '%'}</strong>
          <div className="holder-strip" aria-hidden="true">{holders.map((holder,i) => <i key={holder.wallet} style={{width:(holder.share ?? 0)+'%', opacity:1-i*.065}}/>)}</div>
        </div>
        <ol className="holder-ranking">{holders.map((holder,i) => <li key={holder.wallet}>
          <a href={'https://solscan.io/account/' + holder.wallet} target="_blank" rel="noopener noreferrer" aria-label={'View wallet '+holder.wallet+' on Solscan'}>
            <span className="holder-rank">{String(i+1).padStart(2,'0')}</span><span className="holder-address">{short(holder.wallet)} <small aria-hidden="true">↗</small></span>
            <strong>{holder.share == null ? '—' : holder.share.toFixed(2)+'%'}</strong>
            <span className="holder-track" aria-hidden="true"><i style={{width:(holder.share ?? 0)+'%'}}/></span>
          </a></li>)}</ol>
      </> : <p className="holder-note">{busy ? 'Checking holder balances…' : 'Holder balances unavailable.'}</p>}
      <p className="holder-note">Based on the 20 largest token accounts. One wallet can own several accounts. Pools and exchanges are included.</p>
    </details>
    <details className="security-evidence"><summary>All security checks</summary><SignalRows report={report} busy={busy}/></details>
    <p className="signal-coverage">Sampled evidence · Unknown does not mean safe. Shared funding does not prove a bundle.</p>
    <details className="signal-monitor"><summary>Monitoring & alerts{alerts.length ? ` (${alerts.length})` : ''}</summary><label><input type="checkbox" checked={monitor} onChange={e => setMonitor(e.target.checked)} /> Refresh every 60 seconds while visible</label><p className="subtle">Pauses in hidden tabs. Changes between checks may be missed.</p>{alerts.length > 0 && <div role="status" aria-live="polite">{alerts.map((alert, i) => <p className="form-note" key={`${i}:${alert}`}>{alert}</p>)}</div>}</details>
    {report && <>
      <details className="security-evidence"><summary>Inspect wallet and developer evidence</summary>
        <h4>Shared SOL senders</h4>{report.linkedSupplyPercent !== null && <p className="subtle">Sampled linked accounts hold {report.linkedSupplyPercent.toFixed(2)}% of supply. This includes any pools or services in the sample.</p>}
        {!report.wallets?.sharedFunding.length && <p className="subtle">No shared sender evidence returned in this sample.</p>}
        {report.wallets?.sharedFunding.map(group => <article key={group.source}><p>Sender <code>{group.source}</code> · {group.wallets.length} sampled wallets</p>{group.evidence.map((item, index) => <p className="subtle" key={`${item.signature}:${item.receiver}:${index}`}>Received by <code>{item.receiver}</code> · {item.lamports} lamports · slot {item.slot}<br />Transaction <code>{item.signature}</code></p>)}</article>)}
        <h4>Early token activity</h4>
        {report.launch ? <><p className="subtle">{report.launch.window === 'launch' ? 'Mint initialization located' : report.launch.window === 'earliest-available' ? 'Earliest available history; initialization not found' : 'Recent history; launch boundary not reached'} · {report.launch.signaturesScanned} signatures scanned · {report.launch.transactionsRead}/{report.launch.transactionsRequested} transactions read · {report.launch.sampledWallets} signed token owners · {report.launch.partial ? 'partial sample' : 'available token history read'}.</p>{report.launch.initializationSignature && <a href={'https://solscan.io/tx/' + report.launch.initializationSignature} target="_blank" rel="noopener noreferrer">View mint initialization</a>}{report.launch.accumulation.map(group => <article key={group.slot}><p>Early/history slot {group.slot} · {group.wallets.length} signed token owners</p>{group.evidence.map(item => <p className="subtle" key={item.signature + ':' + item.wallet}>Wallet <code>{item.wallet}</code> · +{item.amountRaw} raw token units<br />Transaction <code>{item.signature}</code></p>)}</article>)}{report.launch.sharedFunding.map(group => <article key={group.source}><p>Shared sender <code>{group.source}</code> · {group.wallets.length} owners in token-history sample</p>{group.evidence.map((item, index) => <p className="subtle" key={item.signature + ':' + index}>Received by <code>{item.receiver}</code> · {item.lamports} lamports · slot {item.slot}<br />Transaction <code>{item.signature}</code></p>)}</article>)}</> : <p className="subtle">Token-history evidence unavailable. The current-holder sample below does not reconstruct the launch.</p>}
        <h4>Current-holder same-slot accumulation</h4>
        {!report.wallets?.accumulation?.length && <p className="subtle">No matching evidence returned. This does not rule out bundles.</p>}
        {report.wallets?.accumulation?.map(group => <article key={group.slot}><p>Slot {group.slot} · {group.wallets.length} wallets</p>{group.evidence.map(item => <p className="subtle" key={`${item.signature}:${item.wallet}`}>Wallet <code>{item.wallet}</code> · +{item.amountRaw} raw token units<br />Transaction <code>{item.signature}</code></p>)}</article>)}
        <h4>Developer’s other launches</h4>
        {!report.history?.entries.length && <p className="subtle">No other launch risk reports available.</p>}
        {report.history?.entries.map(entry => <article key={entry.mint}><p><code>{entry.mint}</code></p><p className="subtle">{entry.report?.rugged === true ? 'RugCheck: flagged rugged' : entry.report?.rugged === false ? 'RugCheck: no rugged flag in this report' : 'Unknown — matching creator and explicit status not available'}{entry.report && ` · Fetched ${new Date(entry.report.fetchedAt).toLocaleString()}`}</p></article>)}
        {report.provider && <><h4>RugCheck token warnings</h4><p className="subtle">Fetched {new Date(report.provider.fetchedAt).toLocaleString()} · Provider results may lag on-chain changes.</p>{report.provider.risks.map((risk, index) => <p key={`${risk.name}:${index}`}><strong>{risk.name}</strong> · {risk.level}<br /><span className="subtle">{risk.description}</span></p>)}<a href={`https://rugcheck.xyz/tokens/${report.mint}`} target="_blank" rel="noopener noreferrer">Open source report</a></>}
      </details><p className="subtle">Observed means data was read, not that the token is safe. No major flags in a partial sample cannot verify a clean launch.</p></>}
  </section>;
}
