export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export type Market = { pool: string; mint: string; name: string; symbol: string; imageUrl: string | null; price: number | null; volume24h: number | null; liquidity: number | null; change24h: number | null; createdAt: string | null; decimals: number | null; dex: string; tokenSide: "base" | "quote" };
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type MarketResponse = { markets: Market[]; observedAt: string; source: string };
export type Order = { transaction: string | null; requestId: string; inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold: string; feeBps: number; feeMint: string; slippageBps: number; priceImpactPct: string; router: string; ticket?: string; expiresAt?: number; errorMessage?: string; lastValidBlockHeight?: number };
export type BuiltTransaction = { transaction: string; ticket: string; expiresAt: number; networkFeeLamports: string | null; kind: string; mint?: string; pool?: string; config?: string; summary: string; network: "mainnet" | "devnet" };
export type IntegrationStatus = { market: boolean; trading: boolean; rpc: boolean; signing: boolean; launches: boolean; config: string | null; treasury: string | null; buybackMint: string | null; mainnetEnabled: boolean; origin: string | null };
export type PoolDetails = { address: string; mint: string; creator: string; config: string; graduated: boolean; progress: number; creatorFeePercent: number; partnerFees: string; creatorFees: string; quoteMint: string; isRilo: boolean; historyAvailable: boolean; history: { pool: string; mint: string; graduated: boolean }[] };
export type WalletEvidence = { sampledWallets: number; transactionsRead: number; incomplete: boolean; owners: { wallet: string; accounts: number }[]; sharedFunding: { source: string; wallets: string[]; evidence: { signature: string; receiver: string; lamports: number; slot: number }[] }[] };

export function toUnits(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18 || !/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive amount without commas or scientific notation.");
  const [integer, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`This token supports up to ${decimals} decimal places.`);
  const amount = BigInt(integer) * BigInt(10) ** BigInt(decimals) + BigInt((fraction.padEnd(decimals, "0") || "0"));
  if (amount <= BigInt(0) || amount > BigInt("18446744073709551615")) throw new Error("Amount is outside the supported range.");
  return amount.toString();
}
export function fromUnits(value: string, decimals: number): string {
  if (!/^\d+$/.test(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return "—";
  const padded = value.padStart(decimals + 1, "0");
  return decimals ? `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`.replace(/\.?0+$/, "") : padded;
}
export function normalizeCandles(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return [];
  const unique = new Map<number, Candle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6 || !row.slice(0, 6).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) continue;
    const [time, open, high, low, close, volume] = row;
    if (!Number.isInteger(time) || high < Math.max(open, close, low) || low > Math.min(open, close)) continue;
    unique.set(time, { time, open, high, low, close, volume });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
