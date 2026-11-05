import { isSolanaAddress } from './token-analysis.ts';
export type ProviderRisk = {
  mint: string; source: 'RugCheck'; fetchedAt: string; creator: string | null;
  rugged: boolean | null; risks: { name: string; description: string; level: 'danger' | 'warn' | 'info' }[];
};
export type DeveloperRiskHistory = { creator: string; totalKnown: number; sampled: number; checked: number; entries: { mint: string; report: ProviderRisk | null }[] };
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) : '';
export function providerRisk(raw: unknown, mint: string, fetchedAt: string): ProviderRisk | null {
  if (!raw || typeof raw !== 'object' || !isSolanaAddress(mint)) return null;
  const report = raw as Record<string, unknown>;
  if (report.mint !== mint) return null;
  const risks: ProviderRisk['risks'] = [];
  if (Array.isArray(report.risks)) for (const item of report.risks.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const name = text(item.name, 120), description = text(item.description, 600);
    if (name && ['danger', 'warn', 'info'].includes(item.level)) risks.push({ name, description, level: item.level });
  }
  return { mint, source: 'RugCheck', fetchedAt, creator: typeof report.creator === 'string' && isSolanaAddress(report.creator) ? report.creator : null, rugged: typeof report.rugged === 'boolean' ? report.rugged : null, risks };
}
export function developerRiskHistory(creator: string, knownMints: string[], entries: DeveloperRiskHistory['entries']): DeveloperRiskHistory {
  const known = new Set(knownMints.filter(isSolanaAddress)), seen = new Set<string>();
  const verified = entries.filter(entry => { if (!known.has(entry.mint) || seen.has(entry.mint)) return false; seen.add(entry.mint); return true; }).map(entry => ({ mint: entry.mint, report: entry.report?.mint === entry.mint && entry.report.creator === creator ? entry.report : null }));
  return { creator, totalKnown: known.size, sampled: verified.length, checked: verified.filter(entry => entry.report?.rugged !== null && entry.report?.rugged !== undefined).length, entries: verified };
}
