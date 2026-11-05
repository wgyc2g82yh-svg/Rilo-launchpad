import type { WalletEvidence } from './integration-types';
export type ParsedWalletTransaction = {
  slot: number;
  meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[]; innerInstructions?: { instructions: Instruction[] }[] } | null;
  transaction: { message: { accountKeys?: { pubkey: string; signer: boolean }[]; instructions: Instruction[] } };
};
type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
type Instruction = { program?: string; parsed?: { type: string; info: { source?: string; destination?: string; lamports?: number } } };
export type WalletTransactionSample = { signature: string; wallet: string; tx: ParsedWalletTransaction };
export function walletConnections(mint: string, samples: WalletTransactionSample[]) {
  const funding = new Map<string, { source: string; wallets: Set<string>; evidence: WalletEvidence['sharedFunding'][number]['evidence'] }>();
  const slots = new Map<number, Map<string, { wallet: string; signature: string; amountRaw: string }>>();
  const seen = new Set<string>();
  for (const { signature, wallet, tx } of samples) {
    const key = `${signature}:${wallet}`;
    if (seen.has(key) || !tx.meta || tx.meta.err || !Number.isSafeInteger(tx.slot) || tx.slot < 0) continue;
    seen.add(key);
    for (const instruction of [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap(item => item.instructions)]) {
      const info = instruction.parsed?.info;
      if (instruction.program !== 'system' || instruction.parsed?.type !== 'transfer' || info?.destination !== wallet || !info.source || info.source === wallet || !Number.isSafeInteger(info.lamports) || info.lamports! <= 0) continue;
      const entry = funding.get(info.source) ?? { source: info.source, wallets: new Set<string>(), evidence: [] };
      entry.wallets.add(wallet); entry.evidence.push({ signature, receiver: wallet, lamports: info.lamports!, slot: tx.slot }); funding.set(info.source, entry);
    }
    // A signed positive balance change is accumulation, not necessarily a purchase.
    if (!tx.transaction.message.accountKeys?.some(key => key.pubkey === wallet && key.signer)) continue;
    const before = tx.meta.preTokenBalances, after = tx.meta.postTokenBalances;
    if (!Array.isArray(before) || !Array.isArray(after)) continue;
    const indices = new Set([...before, ...after].filter(item => item.mint === mint && item.owner === wallet).map(item => item.accountIndex));
    if ([...before, ...after].some(item => item.mint === mint && indices.has(item.accountIndex) && item.owner !== wallet)) continue;
    if ([before, after].some(rows => { const accounts = rows.filter(item => item.mint === mint && item.owner === wallet).map(item => item.accountIndex); return accounts.some(index => !Number.isSafeInteger(index) || index < 0) || new Set(accounts).size !== accounts.length; })) continue;
    const balances = [...before, ...after].filter(item => item.mint === mint && item.owner === wallet);
    if (!balances.length || balances.some(item => !/^\d+$/.test(item.uiTokenAmount?.amount ?? ''))) continue;
    const sum = (rows: TokenBalance[]) => rows.filter(item => item.mint === mint && item.owner === wallet).reduce((total, item) => total + BigInt(item.uiTokenAmount.amount), 0n);
    const received = sum(after) - sum(before);
    if (received <= 0n) continue;
    const entries = slots.get(tx.slot) ?? new Map();
    entries.set(key, { wallet, signature, amountRaw: received.toString() }); slots.set(tx.slot, entries);
  }
  return {
    sharedFunding: [...funding.values()].filter(entry => entry.wallets.size >= 2).map(entry => ({ source: entry.source, wallets: [...entry.wallets], evidence: entry.evidence })),
    accumulation: [...slots].filter(([, entries]) => new Set([...entries.values()].map(item => item.wallet)).size >= 2).map(([slot, entries]) => ({ slot, wallets: [...new Set([...entries.values()].map(item => item.wallet))], evidence: [...entries.values()] })).sort((a, b) => b.slot - a.slot).slice(0, 10),
  };
}
