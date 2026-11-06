import { isSolanaAddress } from './token-analysis.ts';
import { tokenTransactionCount, walletConnections } from './wallet-evidence.ts';
import type { ParsedWalletTransaction, WalletTransactionSample } from './wallet-evidence';

export type LaunchActivity = {
  mint: string; window: 'launch' | 'earliest-available' | 'recent';
  signaturesScanned: number; transactionsRequested: number; transactionsRead: number;
  tokenTransactionsRead: number; sampledWallets: number; historyBoundaryReached: boolean;
  initializationSignature: string | null; firstSlot: number | null; lastSlot: number | null;
  partial: boolean; sharedFunding: ReturnType<typeof walletConnections>['sharedFunding'];
  accumulation: ReturnType<typeof walletConnections>['accumulation'];
};
type Signature = { signature: string; slot: number; err: unknown };
type Read = (method: string, params: unknown[]) => Promise<unknown>;

export function mintInitialized(tx: ParsedWalletTransaction, mint: string): boolean {
  if (!tx.meta || tx.meta.err) return false;
  return [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap(row => row.instructions)].some(instruction =>
    ['spl-token', 'spl-token-2022'].includes(instruction.program ?? '') &&
    ['initializeMint', 'initializeMint2'].includes(instruction.parsed?.type ?? '') && instruction.parsed?.info.mint === mint);
}
export function signedTokenSamples(mint: string, signature: string, tx: ParsedWalletTransaction): WalletTransactionSample[] {
  if (!tx.meta || tx.meta.err || !Array.isArray(tx.meta.preTokenBalances) || !Array.isArray(tx.meta.postTokenBalances)) return [];
  const owners = new Set([...tx.meta.preTokenBalances, ...tx.meta.postTokenBalances].filter(row => row.mint === mint).map(row => row.owner));
  return (tx.transaction.message.accountKeys ?? []).filter(key => key.signer && owners.has(key.pubkey) && isSolanaAddress(key.pubkey)).map(key => ({ signature, wallet: key.pubkey, tx }));
}

// Read the oldest available token activity, including early wallets that have
// already exited. A mint initialization must be read before calling it launch data.
// Bounded to three signature pages, 24 transactions, four concurrent reads.
export async function scanLaunchActivity(mint: string, read: Read, now = Date.now): Promise<LaunchActivity> {
  if (!isSolanaAddress(mint)) throw new Error('Invalid token mint.');
  const deadline = now() + 16_000, rows: Signature[] = [], seen = new Set<string>();
  let before: string | undefined, historyBoundaryReached = false, providerGap = false;
  for (let page = 0; page < 3 && now() < deadline; page++) {
    let result: unknown;
    try { result = await read('getSignaturesForAddress', [mint, { limit: 1000, commitment: 'confirmed', ...(before ? { before } : {}) }]); }
    catch { providerGap = true; break; }
    if (!Array.isArray(result)) { providerGap = true; break; }
    for (const row of result) {
      if (typeof row?.signature !== 'string' || !Number.isSafeInteger(row.slot) || row.slot < 0 || seen.has(row.signature)) continue;
      seen.add(row.signature); rows.push(row);
    }
    if (result.length < 1000) { historyBoundaryReached = true; break; }
    const cursor = result.at(-1)?.signature;
    if (typeof cursor !== 'string' || cursor === before) { providerGap = true; break; }
    before = cursor;
  }
  if (!rows.length && providerGap) throw new Error('Token transaction history is unavailable.');
  const successful = rows.filter(row => row.err === null);
  const selected = historyBoundaryReached ? successful.slice(-24).reverse() : successful.slice(0, 24).reverse();
  const transactions: { signature: string; tx: ParsedWalletTransaction }[] = [];
  let requested = 0;
  for (let offset = 0; offset < selected.length && now() < deadline; offset += 4) {
    const batch = selected.slice(offset, offset + 4); requested += batch.length;
    const loaded = await Promise.all(batch.map(async row => {
      try {
        const tx = await read('getTransaction', [row.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]) as ParsedWalletTransaction | null;
        return tx?.meta && !tx.meta.err && tx.slot === row.slot && tx.transaction?.message ? { signature: row.signature, tx } : null;
      } catch { return null; }
    }));
    transactions.push(...loaded.filter((row): row is NonNullable<typeof row> => row !== null));
  }
  const samples = transactions.flatMap(({ signature, tx }) => signedTokenSamples(mint, signature, tx));
  const initialization = transactions.find(({ tx }) => mintInitialized(tx, mint));
  const slots = transactions.map(({ tx }) => tx.slot);
  return {
    mint, window: initialization ? 'launch' : historyBoundaryReached ? 'earliest-available' : 'recent',
    signaturesScanned: rows.length, transactionsRequested: requested, transactionsRead: transactions.length,
    tokenTransactionsRead: tokenTransactionCount(mint, samples), sampledWallets: new Set(samples.map(sample => sample.wallet)).size,
    historyBoundaryReached, initializationSignature: initialization?.signature ?? null,
    firstSlot: slots.length ? Math.min(...slots) : null, lastSlot: slots.length ? Math.max(...slots) : null,
    partial: providerGap || !initialization || transactions.length < selected.length || successful.length > selected.length,
    ...walletConnections(mint, samples),
  };
}
