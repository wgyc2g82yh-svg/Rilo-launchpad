import 'server-only';
import { rpc } from '@/lib/solana-rpc';
import { cached, IntegrationError } from '@/lib/integration-server';
import { analyzeMint, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '@/lib/token-analysis';
import type { MintInfo, LargestAccount } from '@/lib/token-analysis';
import { analyzeWallets } from '@/lib/wallet-analysis';
import { poolForMint } from '@/lib/bonding-curve';
import { tokenLiquidity } from '@/lib/liquidity-service';
import { tokenProviderRisk, creatorRiskHistory } from '@/lib/rugcheck-service';
import { securityReport } from '@/lib/security-report';
import { scanLaunchActivity } from '@/lib/launch-activity';
export async function tokenSecurity(mint: string, pool?: string) {
  return cached(`security:${mint}:${pool ?? ''}`, 30_000, async () => {
    const account = await rpc<{ context: { slot: number }; value: { owner: string; data: { parsed?: { type: string; info: MintInfo } } } | null }>('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    if (!account.value) throw new IntegrationError(404, 'Mint not found on the configured network.');
    if (![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(account.value.owner) || account.value.data.parsed?.type !== 'mint') throw new IntegrationError(422, 'Choose a supported SPL token mint.');
    // History can start as soon as the creator resolves; do not wait for the
    // wallet sample before starting another bounded provider batch.
    const creatorResult = poolForMint(mint).catch(() => null);
    const providerResult = tokenProviderRisk(mint).catch(() => null);
    const [largest, wallets, creator, liquidity, provider, history, launch] = await Promise.all([
      rpc<{ value: LargestAccount[] }>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]).catch(() => null),
      analyzeWallets(mint).catch(() => null), creatorResult,
      pool ? tokenLiquidity(mint, pool).catch(() => null) : Promise.resolve(null), providerResult,
      Promise.all([creatorResult, providerResult]).then(([creator, provider]) => creatorRiskHistory(creator, provider)).catch(() => null),
      cached(`launch-activity:${mint}`, 120_000, () => scanLaunchActivity(mint, rpc)).catch(() => null),
    ]);
    return securityReport(analyzeMint(mint, account.value.owner, account.value.data.parsed.info, largest?.value ?? null, account.context.slot), wallets, creator, liquidity, provider, history, launch);
  });
}
