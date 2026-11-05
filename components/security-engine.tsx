"use client";
import { useEffect, useRef, useState } from 'react';
import { rilo } from '@/lib/rilo-client';
import { newRiskAlerts } from '@/lib/security-report';
import type { SecurityCheck, SecurityReport } from '@/lib/security-report';

const short = (value: string) => `${value.slice(0, 5)}…${value.slice(-4)}`;
function SignalIcon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">{kind === 'bundles' ? <><path d="m10 14 4-4M9 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></> : kind === 'concentration' ? <path d="M5 19V9m7 10V4m7 15v-8" /> : kind === 'liquidity' ? <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></> : kind === 'controls' ? <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></> : <><path d="m12 3 10 17H2zM12 9v5m0 2v1" /></>}</svg>;
}
function WalletGraph({ report, busy }: { report: SecurityReport | null; busy: boolean }) {
  const groups = report?.wallets?.sharedFunding ?? [];
  const shown = groups.slice(0, 3);
  const addresses = [...new Set(shown.flatMap(group => [group.source, ...group.wallets]))].slice(0, 15);
  const points = addresses.map((address, i) => ({ address, x: 260 + Math.cos(i * Math.PI * 2 / addresses.length - Math.PI / 2) * 190, y: 130 + Math.sin(i * Math.PI * 2 / addresses.length - Math.PI / 2) * 90 }));
  const point = (address: string) => points.find(item => item.address === address);
  return <figure className="coin-wallet-graph">
    {points.length ? <svg viewBox="0 0 520 260" role="img" aria-label="Observed shared SOL funding relationships. These do not prove common ownership or bundling.">
      <circle className="graph-orbit" cx="260" cy="130" r="95" />
      {shown.flatMap(group => group.wallets.map(wallet => { const from = point(group.source), to = point(wallet); return from && to ? <path className="graph-edge" key={`${group.source}:${wallet}`} d={`M ${from.x} ${from.y} Q 260 130 ${to.x} ${to.y}`}><title>{group.source} sent SOL to {wallet}</title></path> : null; }))}
      {points.map(item => <g key={item.address}><title>{item.address}</title><circle className="graph-halo" cx={item.x} cy={item.y} r="12" /><circle className={shown.some(group => group.source === item.address) ? 'graph-sender' : 'graph-wallet'} cx={item.x} cy={item.y} r={shown.some(group => group.source === item.address) ? 6 : 4} /><text x={item.x} y={item.y + 25} textAnchor="middle">{short(item.address)}</text></g>)}
    </svg> : <div className={`graph-empty${busy ? ' is-reading' : ''}`}><svg viewBox="0 0 520 260" aria-hidden="true"><circle cx="260" cy="130" r="88" /><circle cx="260" cy="130" r="60" /><path d="M80 130h360M260 25v210" /></svg><div><span>{busy ? 'Reading wallet evidence' : report?.wallets?.transactionsRead ? 'No shared funding observed' : 'Wallet evidence unavailable'}</span><small>{busy ? 'Relationships appear only when observed.' : 'Recent sample · connections may be missing'}</small></div></div>}
    <figcaption>{points.length ? `Shared SOL senders · ${shown.length} of ${groups.length} groups shown · up to 15 addresses` : 'PUBLIC FUNDING EVIDENCE'}{points.length > 0 && <span> Shared sender ≠ verified bundle</span>}</figcaption>
  </figure>;
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
    const description = !report ? busy ? 'Reading available evidence…' : 'Evidence unavailable' : row.id === 'bundles' ? !report.wallets ? 'Wallet evidence unavailable' : `${report.wallets?.sharedFunding.length ?? 0} shared sender groups · ${report.wallets?.accumulation?.length ?? 0} same-slot groups${report.wallets ? ' · sampled' : ' · no coverage'}` : row.id === 'creator' ? report.history ? `${report.history.checked}/${report.history.sampled} other launch reports checked` : report.creator ? 'Meteora creator found · rug history incomplete' : 'Creator history unavailable' : row.id === 'concentration' ? 'Largest token accounts · pools and exchanges included' : row.id === 'controls' ? state === 'attention' ? 'Supply or transfer controls need review' : state === 'unknown' ? 'Some transfer behavior remains unchecked' : 'Mint and freeze authorities revoked' : row.id === 'liquidity' ? report.liquidity?.status === 'locked' ? 'Provider reports tracked LP locked or burned' : report.liquidity?.status === 'partial' ? 'Tracked LP is partially locked' : report.liquidity?.status === 'unlocked' ? 'Provider reports tracked LP unlocked' : 'Lock evidence unavailable' : report.provider?.rugged === true ? 'RugCheck flags this token as rugged' : report.provider ? `${report.provider.risks.filter(risk => risk.level !== 'info').length} RugCheck warnings · provider report` : 'Provider report unavailable';
    return <details className={`coin-signal-row security-${state}`} key={row.id}><summary><span className="signal-icon"><SignalIcon kind={row.id} /></span><span className="signal-row-copy"><strong>{row.title}</strong><small>{description}</small></span><span className="signal-row-state">{!report && busy ? 'Reading' : state === 'attention' ? 'Review' : state === 'observed' ? 'Observed' : 'Unknown'}</span></summary><div className="signal-row-detail">{checks.length ? checks.map(check => <p key={check.id}><strong>{check.title}</strong> — {check.detail}</p>) : <p>No completed evidence available.</p>}</div></details>;
  })}</div>;
}

export function SecurityEngine({ mint, pool }: { mint: string; pool?: string }) {
  const [monitor, setMonitor] = useState(false), [report, setReport] = useState<SecurityReport | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [revision, setRevision] = useState(0), [alerts, setAlerts] = useState<string[]>([]);
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
  const observed = report?.checks.filter(check => check.id !== 'clean' && check.state !== 'unknown').length ?? 0;
  const total = report?.checks.filter(check => check.id !== 'clean').length ?? 11;
  return <section className="panel security-engine coin-signal-card" aria-label="Token signal engine" aria-busy={busy}>
    <div className="signal-card-top"><p className="eyebrow">SIGNAL ENGINE</p><span className="signal-source">● READ ONLY</span></div>
    <div className="signal-card-heading"><div><h3>{report?.verdict === 'attention' ? 'Risk signals observed' : busy && !report ? 'Reading the token' : report ? 'Partial analysis' : 'Analysis unavailable'}</h3><p>{report ? `Updated ${new Date(report.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · slot ${report.slot.toLocaleString()}` : 'On-chain controls · public wallet evidence'}</p></div><button className="quiet-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? 'Reading…' : 'Refresh'}</button></div>
    {error && <p className="form-error" role="alert">{error}{report ? ' Showing an older snapshot; it may be stale.' : ''}</p>}
    <WalletGraph report={report} busy={busy} />
    <div className="signal-card-metrics"><div><span>Sampled wallets</span><strong>{report?.wallets ? report.wallets.sampledWallets : '—'}</strong></div><div><span>Linked supply</span><strong>{report?.linkedSupplyPercent != null ? `${report.linkedSupplyPercent.toFixed(2)}%` : '—'}</strong></div><div><span>Checks with data</span><strong>{observed}<small> / {total}</small></strong></div></div>
    <SignalRows report={report} busy={busy} />
    <div className="signal-card-footer"><span className="signal-pulse" aria-hidden="true">⌁</span><div><span className="eyebrow">RILO SIGNAL</span><p>{busy ? 'Refreshing available evidence' : report?.verdict === 'attention' ? 'Review the flagged evidence' : 'Coverage remains partial'}</p></div></div>
    <p className="signal-coverage">Sampled evidence · Unknown does not mean safe. Shared funding does not prove a bundle.</p>
    <details className="signal-monitor"><summary>Monitoring & alerts{alerts.length ? ` (${alerts.length})` : ''}</summary><label><input type="checkbox" checked={monitor} onChange={e => setMonitor(e.target.checked)} /> Refresh every 60 seconds while visible</label><p className="subtle">Pauses in hidden tabs. Changes between checks may be missed.</p>{alerts.length > 0 && <div role="status" aria-live="polite">{alerts.map((alert, i) => <p className="form-note" key={`${i}:${alert}`}>{alert}</p>)}</div>}</details>
    {report && <>
      <details className="security-evidence"><summary>Inspect wallet and developer evidence</summary>
        <h4>Shared SOL senders</h4>{report.linkedSupplyPercent !== null && <p className="subtle">Sampled linked accounts hold {report.linkedSupplyPercent.toFixed(2)}% of supply. This includes any pools or services in the sample.</p>}
        {!report.wallets?.sharedFunding.length && <p className="subtle">No shared sender evidence returned in this sample.</p>}
        {report.wallets?.sharedFunding.map(group => <article key={group.source}><p>Sender <code>{group.source}</code> · {group.wallets.length} sampled wallets</p>{group.evidence.map((item, index) => <p className="subtle" key={`${item.signature}:${item.receiver}:${index}`}>Received by <code>{item.receiver}</code> · {item.lamports} lamports · slot {item.slot}<br />Transaction <code>{item.signature}</code></p>)}</article>)}
        <h4>Same-slot accumulation</h4>
        {!report.wallets?.accumulation?.length && <p className="subtle">No matching evidence returned. This does not rule out bundles.</p>}
        {report.wallets?.accumulation?.map(group => <article key={group.slot}><p>Slot {group.slot} · {group.wallets.length} wallets</p>{group.evidence.map(item => <p className="subtle" key={`${item.signature}:${item.wallet}`}>Wallet <code>{item.wallet}</code> · +{item.amountRaw} raw token units<br />Transaction <code>{item.signature}</code></p>)}</article>)}
        <h4>Developer’s other launches</h4>
        {!report.history?.entries.length && <p className="subtle">No other launch risk reports available.</p>}
        {report.history?.entries.map(entry => <article key={entry.mint}><p><code>{entry.mint}</code></p><p className="subtle">{entry.report?.rugged === true ? 'RugCheck: flagged rugged' : entry.report?.rugged === false ? 'RugCheck: no rugged flag in this report' : 'Unknown — matching creator and explicit status not available'}{entry.report && ` · Fetched ${new Date(entry.report.fetchedAt).toLocaleString()}`}</p></article>)}
        {report.provider && <><h4>RugCheck token warnings</h4><p className="subtle">Fetched {new Date(report.provider.fetchedAt).toLocaleString()} · Provider results may lag on-chain changes.</p>{report.provider.risks.map((risk, index) => <p key={`${risk.name}:${index}`}><strong>{risk.name}</strong> · {risk.level}<br /><span className="subtle">{risk.description}</span></p>)}<a href={`https://rugcheck.xyz/tokens/${report.mint}`} target="_blank" rel="noopener noreferrer">Open source report</a></>}
      </details><p className="subtle">Observed means data was read, not that the token is safe. No major flags in a partial sample cannot verify a clean launch.</p></>}
  </section>;
}
