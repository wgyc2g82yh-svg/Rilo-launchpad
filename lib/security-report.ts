import { percentage } from './token-analysis.ts';
import type { Scan } from './token-analysis';
import type { WalletEvidence, PoolDetails } from './integration-types';
import type { LiquidityEvidence } from './liquidity-evidence';
import type { ProviderRisk, DeveloperRiskHistory } from './provider-risk';
import type { LaunchActivity } from './launch-activity';
export type SecurityCheck = { id: string; title: string; state: 'attention' | 'observed' | 'unknown'; detail: string; evidenceKey?: string };
export type SecurityReport = { topHolders: { wallet: string; share: number | null }[]; mint: string; checkedAt: string; slot: number; coverage: 'partial'; verdict: 'attention' | 'incomplete'; linkedSupplyPercent: number | null; checks: SecurityCheck[]; launch: LaunchActivity | null; developer: { wallet: string; source: 'Meteora' | 'RugCheck' } | null; creator: PoolDetails | null; liquidity: LiquidityEvidence | null; wallets: WalletEvidence | null; provider: ProviderRisk | null; history: DeveloperRiskHistory | null };
export function securityReport(scan: Scan, wallets: WalletEvidence | null, creator: PoolDetails | null, liquidity: LiquidityEvidence | null, provider: ProviderRisk | null = null, history: DeveloperRiskHistory | null = null, launch: LaunchActivity | null = null): SecurityReport {
  // Cross-token/creator evidence must never leak into the current assessment.
  if (provider?.mint !== scan.mint) provider = null;
  if (creator?.mint !== scan.mint) creator = null;
  const developer = creator ? { wallet: creator.creator, source: 'Meteora' as const } : provider?.creator ? { wallet: provider.creator, source: 'RugCheck' as const } : null;
  if (history?.creator !== developer?.wallet) history = null;
  if (launch?.mint !== scan.mint) launch = null;
  const flagged = history?.entries.filter(entry => entry.report?.mint === entry.mint && entry.report.creator === history.creator && entry.report.rugged === true) ?? [];
  const accumulation = [...new Map([...(launch?.accumulation ?? []), ...(wallets?.accumulation ?? [])].map(group => [`${group.slot}:${[...group.wallets].sort().join(',')}`, group])).values()];
  const tokenTransactionsRead = (wallets?.tokenTransactionsRead ?? 0) + (launch?.tokenTransactionsRead ?? 0);
  const activityDetail = launch ? `${launch.transactionsRead}/${launch.transactionsRequested} token-history transactions read; ${launch.sampledWallets} signed token owners. ${launch.window === 'launch' ? 'Mint initialization located; early activity sampled.' : launch.window === 'earliest-available' ? 'Earliest available activity sampled; mint initialization not located.' : 'Recent activity sampled; launch boundary not reached within the scan limit.'}` : 'Token-history scan unavailable.';
  const linked = new Set(wallets?.sharedFunding.flatMap(group => group.wallets) ?? []);
  const holders = (wallets?.owners ?? []).filter(owner => linked.has(owner.wallet));
  let linkedSupplyPercent: number | null = null;
  if (linked.size && holders.length === linked.size && holders.every(owner => /^\d+$/.test(owner.amountRaw ?? ''))) {
    const amount = holders.reduce((sum, owner) => sum + BigInt(owner.amountRaw!), 0n);
    if (amount <= BigInt(scan.info.supply)) linkedSupplyPercent = percentage(amount.toString(), scan.info.supply);
  }
  const warningRisks = provider?.risks.filter(risk => risk.level === 'danger' || risk.level === 'warn') ?? [];
  const checks: SecurityCheck[] = scan.checks.slice(0, 4).map((check, i) => ({ id: ['mint', 'freeze', 'concentration', 'extensions'][i], ...check, evidenceKey: check.state === 'attention' ? check.detail : undefined, state: check.state === 'unavailable' ? 'unknown' : check.state }));
  checks.push(
    { id: 'funding', title: 'Connected wallets', state: wallets?.sharedFunding.length ? 'attention' : wallets?.transactionsRead ? 'observed' : 'unknown', evidenceKey: wallets?.sharedFunding.map(group => `${group.source}:${[...group.wallets].sort().join(',')}`).sort().join('|'), detail: wallets ? `${wallets.sharedFunding.length} shared SOL sender groups across ${wallets.sampledWallets} sampled wallets and ${wallets.transactionsRead} recent transactions. Shared senders may be exchanges or services; they do not establish common ownership. ${linkedSupplyPercent === null ? '' : ` These sampled linked accounts hold ${linkedSupplyPercent.toFixed(2)}% of supply; pools and services are not excluded.`} Coverage is partial.` : 'Wallet funding evidence could not be loaded.' },
    { id: 'bundles', title: 'Bundle and coordination signals', state: accumulation.length || launch?.sharedFunding.length ? 'attention' : tokenTransactionsRead ? 'observed' : 'unknown', evidenceKey: accumulation.map(group => `${group.slot}:${[...group.wallets].sort().join(',')}`).sort().join('|') + (launch?.sharedFunding.map(group => `${group.source}:${[...group.wallets].sort().join(',')}`).sort().join('|') ?? ''), detail: `${accumulation.length} same-slot accumulation groups across early/history and current-holder samples; ${launch?.sharedFunding.length ?? 0} shared sender groups in token-history transactions. ${activityDetail} Same-slot token gains may be transfers or independent trading; they do not prove a private bundle. Missing history is not cleared.` },
    { id: 'creator', title: 'Developer launch history', state: developer ? 'observed' : 'unknown', detail: developer ? `${developer.source === 'Meteora' ? 'On-chain Meteora creator' : 'RugCheck-reported creator'}: ${developer.wallet}. ${history ? `${history.totalKnown} other indexed tokens returned (up to 100); ${history.sampled} sampled for risk reports.` : 'Other launch records unavailable.'} Provider attribution is not independent proof of ownership across wallets.` : 'No supported creator attribution available. Mint authority is not assumed to be the developer.' },
    { id: 'rugs', title: 'Developer rug reports', state: flagged.length ? 'attention' : history && (history.checked > 0 || history.totalKnown === 0) ? 'observed' : 'unknown', evidenceKey: flagged.map(entry => entry.mint).sort().join('|'), detail: history ? `${flagged.length} other launches flagged rugged by RugCheck; ${history.checked}/${history.sampled} sampled reports checked from ${history.totalKnown} other indexed tokens (${history.source ?? 'Meteora'}). ${history.sampled - history.checked} unavailable or missing matching creator/status. ${history.totalKnown === 0 ? 'No other tokens returned by this index; this does not establish a first-time developer.' : 'Provider flags are attributed reports, not an independent finding of developer misconduct.'} A clear sample does not clear full history.` : 'Other launch risk reports unavailable. Ungraduated or inactive launches are not classified as rugs.' },
    { id: 'provider', title: 'Rug and token risk reports', state: provider?.rugged === true || warningRisks.length ? 'attention' : provider?.rugged === false ? 'observed' : 'unknown', evidenceKey: `${provider?.rugged === true}:${warningRisks.map(risk => `${risk.level}:${risk.name}`).sort().join('|')}`, detail: provider ? `RugCheck ${provider.rugged === true ? 'flags this token as rugged' : provider.rugged === false ? 'does not currently flag this token as rugged' : 'returned no explicit rugged status'}. ${warningRisks.length} provider warnings. Provider analysis is separate from RILO’s on-chain observations and does not certify safety.` : 'RugCheck evidence is unavailable on this network or for this mint.' },
    { id: 'liquidity', title: 'Liquidity lock', state: !liquidity || liquidity.status === 'unknown' ? 'unknown' : liquidity.status === 'locked' ? 'observed' : 'attention', evidenceKey: liquidity ? `${liquidity.status}:${liquidity.lockedPercent ?? ''}` : undefined, detail: liquidity?.detail ?? 'No supported lock evidence available for the selected pool.' },
    { id: 'clean', title: 'Clean launch verification', state: 'unknown', detail: 'Not verified: full history, private bundles, transfer behavior, and liquidity control are not fully covered. No safety certification is issued.' },
  );
  const rankedOwners = (wallets?.owners ?? []).flatMap(owner => {
    if (!owner.amountRaw || !/^\d+$/.test(owner.amountRaw)) return [];
    const amount = BigInt(owner.amountRaw);
    return amount > 0n ? [{ wallet: owner.wallet, amount }] : [];
  });
  const validTotal = rankedOwners.reduce((sum, owner) => sum + owner.amount, 0n) <= BigInt(scan.info.supply);
  const topHolders = validTotal ? rankedOwners
    .sort((a, b) => a.amount === b.amount ? a.wallet.localeCompare(b.wallet) : a.amount > b.amount ? -1 : 1)
    .slice(0, 10)
    .map(owner => ({ wallet: owner.wallet, share: percentage(owner.amount.toString(), scan.info.supply) })) : [];
  return { topHolders, mint: scan.mint, slot: scan.slot, checkedAt: scan.checkedAt, coverage: 'partial', linkedSupplyPercent, verdict: checks.some(check => check.state === 'attention') ? 'attention' : 'incomplete', checks, developer, creator, liquidity, wallets, provider, history, launch };
}
export function newRiskAlerts(previous: SecurityReport, next: SecurityReport): SecurityCheck[] {
  if (previous.mint !== next.mint) return [];
  return next.checks.filter(check => {
    if (check.state !== 'attention') return false;
    const old = previous.checks.find(item => item.id === check.id);
    return old?.state !== 'attention' || Boolean(check.evidenceKey && old.evidenceKey !== check.evidenceKey);
  });
}
