import "server-only";
import { rpc } from "@/lib/solana-rpc";
import { cached, IntegrationError } from "@/lib/integration-server";
import { address } from "@/lib/chain-transactions";
import type { LargestAccount } from "@/lib/token-analysis";
import type { WalletEvidence } from "@/lib/integration-types";

type Instruction = { program?: string; parsed?: { type: string; info: { source?: string; destination?: string; lamports?: number } } };
type ParsedTransaction = { slot: number; meta: { err: unknown; innerInstructions?: { instructions: Instruction[] }[] } | null; transaction: { message: { instructions: Instruction[] } } };
export async function analyzeWallets(mint: string): Promise<WalletEvidence> {
  address(mint);
  return cached(`wallets:${mint}`, 120_000, async () => {
    const largest = await rpc<{ value: LargestAccount[] }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const accounts = largest.value.slice(0, 12);
    if (!accounts.length) return { sampledWallets: 0, transactionsRead: 0, incomplete: false, owners: [], sharedFunding: [] };
    const accountData = await rpc<{ value: ({ data?: { parsed?: { type: string; info: { owner: string; mint: string } } } } | null)[] }>("getMultipleAccounts", [accounts.map(item => item.address), { encoding: "jsonParsed", commitment: "confirmed" }]);
    const owners = new Map<string, number>();
    for (const account of accountData.value) {
      const parsed = account?.data?.parsed; if (parsed?.type !== "account" || parsed.info.mint !== mint) continue;
      owners.set(parsed.info.owner, (owners.get(parsed.info.owner) ?? 0) + 1);
    }
    const sampled = [...owners.keys()].slice(0, 6); let transactionsRead = 0, incomplete = owners.size > sampled.length;
    const funding = new Map<string, { source: string; wallets: Set<string>; evidence: WalletEvidence["sharedFunding"][number]["evidence"] }>();
    // Small bounded sample: up to 6 owners × 2 recent successful transactions. No bundle/rug verdict.
    for (let offset = 0; offset < sampled.length; offset += 3) {
      await Promise.all(sampled.slice(offset, offset + 3).map(async wallet => {
        try {
          const signatures = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [wallet, { limit: 3, commitment: "confirmed" }]);
          const recent = signatures.filter(item => !item.err).slice(0, 2);
          for (const item of recent) {
            const tx = await rpc<ParsedTransaction | null>("getTransaction", [item.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
            if (!tx || !tx.meta || tx.meta.err) { incomplete = true; continue; } transactionsRead++;
            for (const instruction of [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions ?? []).flatMap(inner => inner.instructions)]) {
              const info = instruction.parsed?.info;
              if (instruction.program !== "system" || instruction.parsed?.type !== "transfer" || info?.destination !== wallet || !info.source || !Number.isSafeInteger(info.lamports) || info.lamports! <= 0) continue;
              const entry = funding.get(info.source) ?? { source: info.source, wallets: new Set<string>(), evidence: [] };
              entry.wallets.add(wallet); entry.evidence.push({ signature: item.signature, receiver: wallet, lamports: info.lamports!, slot: tx.slot }); funding.set(info.source, entry);
            }
          }
        } catch { incomplete = true; }
      }));
    }
    if (!accountData.value.length) throw new IntegrationError(502, "Token account owners could not be read.");
    return { sampledWallets: sampled.length, transactionsRead, incomplete: true, owners: [...owners].map(([wallet, count]) => ({ wallet, accounts: count })), sharedFunding: [...funding.values()].filter(entry => entry.wallets.size >= 2).map(entry => ({ source: entry.source, wallets: [...entry.wallets], evidence: entry.evidence })) };
  });
}
