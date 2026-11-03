"use client";
import { useState } from "react";
import { rilo } from "@/lib/rilo-client";
import type { WalletEvidence } from "@/lib/integration-types";
const short = (value: string) => `${value.slice(0,5)}…${value.slice(-5)}`;
export function WalletIntelligence({ mint }: { mint: string }) {
  const [result, setResult] = useState<WalletEvidence | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function analyze() { setBusy(true); setError(""); try { setResult(await rilo<WalletEvidence>(`wallets?mint=${mint}`)); } catch (e) { setError(e instanceof Error ? e.message : "Wallet analysis could not complete."); } finally { setBusy(false); } }
  return <section className="panel wallet-intelligence"><div className="panel-heading"><div><p className="eyebrow">WALLET ANALYSIS</p><h3>Relationships with evidence.</h3></div><button className="quiet-button" disabled={busy} onClick={() => void analyze()}>{busy ? "Reading chain…" : "Analyze wallets"}</button></div><p className="subtle">Reads owners of the largest token accounts and a bounded sample of recent transactions. Shared funding can come from exchanges or services; it does not prove bundling.</p>{error && <p className="form-error" role="alert">{error}</p>}
    {result && <><div className="intel-summary"><span>{result.owners.length} account owners</span><span>{result.sampledWallets} wallets sampled</span><span>{result.transactionsRead} transactions read</span></div>
      {result.sharedFunding.length ? result.sharedFunding.map(group => <article className="funding-group" key={group.source}><div className="funding-source"><span className="eyebrow">SHARED SOL SENDER</span><strong className="mono">{short(group.source)}</strong><span>{group.wallets.length} sampled wallets</span></div><div className="funding-wallets">{group.wallets.map(wallet => <span className="mono" key={wallet}>{short(wallet)}</span>)}</div><details><summary>View transaction evidence</summary>{group.evidence.map((item, index) => <p className="subtle address" key={`${item.signature}-${index}`}>Slot {item.slot} · {item.lamports / 1e9} SOL to {short(item.receiver)}<br />Signature: {item.signature}</p>)}</details></article>) : <p className="form-note">No shared SOL sender was observed in this sample. Earlier funding, token transfers, private bundles, and unsampled wallets remain unchecked.</p>}
      <p className="data-caption">Partial coverage · Up to 12 token accounts, 6 owners, and 2 recent successful transactions per sampled owner.</p>
    </>}
  </section>;
}
