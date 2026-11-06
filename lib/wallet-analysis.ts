import 'server-only';
import { rpc } from '@/lib/solana-rpc';
import { cached, IntegrationError } from '@/lib/integration-server';
import { address } from '@/lib/chain-transactions';
import type { LargestAccount } from '@/lib/token-analysis';
import type { WalletEvidence } from '@/lib/integration-types';
import { walletConnections, tokenTransactionCount } from '@/lib/wallet-evidence';
import type { ParsedWalletTransaction, WalletTransactionSample } from '@/lib/wallet-evidence';
export async function analyzeWallets(mint: string): Promise<WalletEvidence> {
  address(mint);
  return cached(`wallets:${mint}`, 60_000, async () => {
    const largest = await rpc<{ value: LargestAccount[] }>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
    const accounts = largest.value.slice(0, 20);
    if (!accounts.length) return { sampledWallets: 0, transactionsRead: 0, incomplete: true, owners: [], sharedFunding: [], accumulation: [] };
    const accountData = await rpc<{ value: ({ data?: { parsed?: { type: string; info: { owner: string; mint: string; tokenAmount?: { amount: string } } } } } | null)[] }>('getMultipleAccounts', [accounts.map(item => item.address), { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    const owners = new Map<string, { accounts: number; amountRaw: bigint; complete: boolean }>();
    for (const account of accountData.value) {
      const parsed = account?.data?.parsed;
      if (parsed?.type !== 'account' || parsed.info.mint !== mint || !parsed.info.owner) continue;
      const raw = parsed.info.tokenAmount?.amount;
      const value = owners.get(parsed.info.owner) ?? { accounts: 0, amountRaw: 0n, complete: true };
      value.accounts++; if (raw && /^\d+$/.test(raw)) value.amountRaw += BigInt(raw); else value.complete = false; owners.set(parsed.info.owner, value);
    }
    if (!owners.size) throw new IntegrationError(502, 'Token account owners could not be read.');
    const sampled = [...owners.keys()].slice(0, 6), samples: WalletTransactionSample[] = [];
    const attempted = new Set<string>();
    const deadline = Date.now() + 12_000;
    const loaded = new Map<string, Promise<ParsedWalletTransaction | null>>();
    // Bounded, recent evidence: six owners, four successful transactions each.
    for (let offset = 0; offset < sampled.length; offset += 3) {
      if (Date.now() > deadline) break;
      await Promise.all(sampled.slice(offset, offset + 3).map(async wallet => {
        attempted.add(wallet);
        try {
          const signatures = await rpc<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [wallet, { limit: 6, commitment: 'confirmed' }]);
          for (const item of signatures.filter(item => !item.err).slice(0, 4)) {
            if (Date.now() > deadline) break;
            if (!loaded.has(item.signature)) loaded.set(item.signature, rpc<ParsedWalletTransaction | null>('getTransaction', [item.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]).catch(() => null));
            const tx = await loaded.get(item.signature)!;
            if (!tx) continue;
            if (tx?.meta && !tx.meta.err) samples.push({ signature: item.signature, wallet, tx });
          }
        } catch { /* Missing evidence never becomes a negative finding. */ }
      }));
    }
    return { sampledWallets: attempted.size, transactionsRead: new Set(samples.map(item => item.signature)).size, tokenTransactionsRead: tokenTransactionCount(mint, samples), incomplete: true, owners: [...owners].map(([wallet, value]) => ({ wallet, accounts: value.accounts, amountRaw: value.complete ? value.amountRaw.toString() : undefined })), ...walletConnections(mint, samples) };
  });
}
