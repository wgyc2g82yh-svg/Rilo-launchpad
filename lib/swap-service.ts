import "server-only";
import { MAINNET_GENESIS, SOL_MINT } from "@/lib/integration-types";
import type { Order } from "@/lib/integration-types";
import bs58 from "bs58";
import { address, verifyWalletSignature, versionedMessage } from "@/lib/chain-transactions";
import { IntegrationError, fetchProvider, seal, transactionNetwork, unseal } from "@/lib/integration-server";

type SwapTicket = { kind: "swap"; wallet: string; message: string; requestId: string; expiresAt: number; lastValidBlockHeight?: number };
const root = () => (process.env.JUPITER_API_URL || "https://api.jup.ag/swap/v2").replace(/\/$/, "");
const headers = (): Record<string, string> => process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {};
let lastOrder = 0;
export async function swapOrder(input: Record<string, unknown>) {
  const inputMint = address(input.inputMint), outputMint = address(input.outputMint);
  if (inputMint === outputMint || inputMint !== SOL_MINT && outputMint !== SOL_MINT) throw new IntegrationError(400, "Choose a SOL/token pair.");
  const amount = String(input.amount ?? "");
  if (!/^\d{1,20}$/.test(amount) || BigInt(amount) <= BigInt(0) || BigInt(amount) > BigInt("18446744073709551615")) throw new IntegrationError(400, "Enter a valid swap amount in token units.");
  if (!process.env.JUPITER_API_KEY && Date.now() - lastOrder < 2100) throw new IntegrationError(429, "Please wait a moment before requesting a new quote.");
  lastOrder = Date.now();
  const params = new URLSearchParams({ inputMint, outputMint, amount, maxSupportedTransactionVersion: "0" });
  const slippage = Number(input.slippageBps ?? 100);
  if (!Number.isInteger(slippage) || slippage < 1 || slippage > 500) throw new IntegrationError(400, "Slippage must be between 0.01% and 5%.");
  params.set("slippageBps", String(slippage));
  const wallet = input.wallet ? address(input.wallet) : null;
  if (wallet) {
    if (await transactionNetwork() !== MAINNET_GENESIS) throw new IntegrationError(422, "Jupiter swaps are available on mainnet. The configured RPC is on a different network.");
    params.set("taker", wallet);
  }
  const referral = process.env.JUPITER_REFERRAL_ACCOUNT, referralFee = process.env.JUPITER_REFERRAL_FEE_BPS;
  if (referral && referralFee) {
    address(referral); if (!/^\d+$/.test(referralFee) || Number(referralFee) > 1000) throw new IntegrationError(503, "The swap referral fee is not configured correctly.");
    params.set("referralAccount", referral); params.set("referralFee", referralFee);
  }
  const raw = await fetchProvider(`${root()}/order?${params}`, { headers: headers() }) as Order & { expireAt?: string };
  if (raw.inputMint !== inputMint || raw.outputMint !== outputMint || raw.inAmount !== amount || !/^\d+$/.test(raw.outAmount) || !raw.requestId) throw new IntegrationError(502, "The provider returned an inconsistent swap quote.");
  if (!/^\d+$/.test(raw.otherAmountThreshold) || !Number.isInteger(raw.slippageBps) || raw.slippageBps < 0 || raw.slippageBps > slippage || BigInt(raw.otherAmountThreshold) < BigInt(raw.outAmount) * BigInt(10000 - slippage) / BigInt(10000)) throw new IntegrationError(502, "The returned quote does not respect the selected slippage limit.");
  const result: Order = { inputMint, outputMint, inAmount: amount, outAmount: raw.outAmount, otherAmountThreshold: raw.otherAmountThreshold || raw.outAmount, feeBps: raw.feeBps ?? 0, feeMint: raw.feeMint || inputMint, slippageBps: raw.slippageBps ?? slippage, priceImpactPct: String(raw.priceImpactPct ?? "0"), router: raw.router, transaction: raw.transaction, requestId: raw.requestId, lastValidBlockHeight: raw.lastValidBlockHeight, errorMessage: raw.transaction === "" ? "A price was found, but a transaction could not be built. Check the wallet balance and available SOL." : undefined };
  if (wallet && raw.transaction) {
    const { hash } = versionedMessage(raw.transaction, wallet);
    const expiresAt = Math.min(Date.now() + 45_000, raw.expireAt && Number.isFinite(Date.parse(raw.expireAt)) ? Date.parse(raw.expireAt) : Infinity);
    result.ticket = seal({ kind: "swap", wallet, message: hash, requestId: raw.requestId, expiresAt, lastValidBlockHeight: raw.lastValidBlockHeight }); result.expiresAt = expiresAt;
  }
  return result;
}
export async function executeSwap(body: Record<string, unknown>) {
  if (await transactionNetwork() !== MAINNET_GENESIS) throw new IntegrationError(422, "The RPC is not connected to mainnet.");
  const ticket = unseal<SwapTicket>(body.ticket, "swap");
  if (typeof body.transaction !== "string" || body.transaction.length > 20_000 || !/^[A-Za-z0-9+/=]+$/.test(body.transaction)) throw new IntegrationError(400, "Invalid signed swap transaction.");
  const { tx, index, hash } = versionedMessage(body.transaction, ticket.wallet);
  if (hash !== ticket.message || !verifyWalletSignature(tx, ticket.wallet, index)) throw new IntegrationError(400, "The signed swap does not match the reviewed quote.");
  const result = await fetchProvider(`${root()}/execute`, { method: "POST", headers: { "Content-Type": "application/json", ...headers() }, body: JSON.stringify({ signedTransaction: body.transaction, requestId: ticket.requestId, lastValidBlockHeight: ticket.lastValidBlockHeight }) }) as { status: string; signature?: string; code?: number; totalInputAmount?: string; totalOutputAmount?: string };
  let validSignature = false; try { validSignature = typeof result.signature === "string" && bs58.decode(result.signature).length === 64; } catch {}
  return { status: result.status === "Success" && validSignature ? "confirmed" : "failed", signature: validSignature ? result.signature : undefined, inputAmount: result.totalInputAmount, outputAmount: result.totalOutputAmount };
}
