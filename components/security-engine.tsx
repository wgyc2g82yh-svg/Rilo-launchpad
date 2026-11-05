"use client";
import { useEffect, useRef, useState } from 'react';
import { rilo } from '@/lib/rilo-client';
import { newRiskAlerts } from '@/lib/security-report';
import type { SecurityReport } from '@/lib/security-report';
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
  return <section className="panel security-engine"><div className="panel-heading"><div><p className="eyebrow">RILO SECURITY ENGINE</p><h3>{report?.verdict === 'attention' ? 'Risk signals observed' : 'Security coverage is partial'}</h3></div><button className="quiet-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? 'Checking…' : 'Refresh checks'}</button></div>
    <label><input type="checkbox" checked={monitor} onChange={e => setMonitor(e.target.checked)} /> Monitor while this page is open (every 60 seconds)</label>
    <p className="subtle">Alerts appear here when attention signals or their evidence change. Monitoring pauses in hidden tabs and resumes when visible. Changes between checks may be missed.</p>
    {error && <p className="form-error" role="alert">{error}{report ? ' Last successful snapshot remains below and may be stale.' : ''}</p>}
    {alerts.length > 0 && <div role="status" aria-live="polite">{alerts.map((alert, i) => <p className="form-note" key={`${i}:${alert}`}>{alert}</p>)}</div>}
    {report && <><p className="data-caption">Observed {new Date(report.checkedAt).toLocaleString()} · Mint slot {report.slot} · Sources use separate snapshots</p><div className="security-checks">{report.checks.map(check => <article key={check.id}><div><strong>{check.title}</strong><span className={`badge security-${check.state}`}>{check.state === 'attention' ? 'Attention' : check.state === 'observed' ? 'Observed' : 'Unknown'}</span></div><p className="subtle">{check.detail}</p></article>)}</div>
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
