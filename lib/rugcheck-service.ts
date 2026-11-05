import 'server-only';
import { cached, fetchProvider, IntegrationError } from '@/lib/integration-server';
import { rpc } from '@/lib/solana-rpc';
import { MAINNET_GENESIS } from '@/lib/integration-types';
import type { PoolDetails } from '@/lib/integration-types';
import { isSolanaAddress } from '@/lib/token-analysis';
import { providerRisk, developerRiskHistory } from '@/lib/provider-risk';
export async function rugcheckReport(mint: string) {
  if (!isSolanaAddress(mint)) throw new IntegrationError(400, 'Choose a valid token mint.');
  const network = await cached('rugcheck-network', 30_000, () => rpc<string>('getGenesisHash'));
  if (network !== MAINNET_GENESIS) throw new IntegrationError(422, 'RugCheck reports cover Solana mainnet only.');
  return cached(`rugcheck:${mint}`, 60_000, async () => {
    const root = (process.env.RUGCHECK_API_URL || 'https://api.rugcheck.xyz/v1').replace(/\/$/, '');
    return { report: await fetchProvider(`${root}/tokens/${mint}/report`), observedAt: new Date().toISOString() };
  });
}
export async function tokenProviderRisk(mint: string) {
  const result = await rugcheckReport(mint);
  return providerRisk(result.report, mint, result.observedAt);
}
export async function creatorRiskHistory(pool: PoolDetails | null) {
  if (!pool?.historyAvailable) return null;
  const mints = [...new Set(pool.history.map(item => item.mint))].filter(mint => mint !== pool.mint && isSolanaAddress(mint));
  // Five distinct other launches, in two bounded batches; no exhaustive-history claim.
  const entries = [];
  for (let i = 0; i < Math.min(mints.length, 5); i += 3) entries.push(...await Promise.all(mints.slice(i, Math.min(i + 3, 5)).map(async mint => ({ mint, report: await tokenProviderRisk(mint).catch(() => null) }))));
  return developerRiskHistory(pool.creator, mints, entries);
}
