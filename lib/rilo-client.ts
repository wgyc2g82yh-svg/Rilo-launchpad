"use client";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";
import { Buffer } from "buffer";
import { phantomProvider } from "@/components/wallet-provider";
import type { BuiltTransaction, Order } from "@/lib/integration-types";
export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfterMs = 20_000) { super(message); }
}

export async function rilo<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/rilo/${path}`, body === undefined ? { signal } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError("The service is temporarily unavailable. Please try again shortly.", response.status || 502); }
  if (!response.ok) {
    const retry = Number(response.headers.get("Retry-After"));
    throw new ApiError(data.error || "The request could not complete.", response.status, retry > 0 && Number.isFinite(retry) ? Math.min(300_000, retry * 1000) : response.status === 429 ? 60_000 : 20_000);
  }
  return data as T;
}
function signer(wallet: string) {
  const provider = phantomProvider();
  if (!provider?.signTransaction || provider.publicKey?.toString() !== wallet) throw new Error("Connect the same Phantom wallet that reviewed this action.");
  return provider;
}
export async function signBuilt(built: BuiltTransaction, wallet: string, extra?: Keypair) {
  if (Date.now() > built.expiresAt) throw new Error("The transaction expired. Prepare it again.");
  const provider = signer(wallet), tx = Transaction.from(Buffer.from(built.transaction, "base64"));
  if (tx.feePayer?.toBase58() !== wallet) throw new Error("The transaction payer does not match this wallet.");
  if (extra) { if (![built.mint, built.config].includes(extra.publicKey.toBase58())) throw new Error("The generated account does not match the prepared transaction."); tx.partialSign(extra); }
  const signed = await provider.signTransaction!(tx);
  return rilo<{ signature: string; status: string; mint?: string; config?: string; network: "mainnet" | "devnet" }>("transaction/submit", { ticket: built.ticket, transaction: Buffer.from(signed.serialize()).toString("base64") });
}
export async function signSwap(order: Order, wallet: string) {
  if (!order.transaction || !order.ticket || !order.expiresAt || Date.now() > order.expiresAt) throw new Error("Request a fresh executable quote before signing.");
  const provider = signer(wallet), tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  if (!tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).some(key => key.toBase58() === wallet)) throw new Error("This wallet is not a required swap signer.");
  const signed = await provider.signTransaction!(tx);
  return rilo<{ signature?: string; status: string }>("swap/execute", { ticket: order.ticket, transaction: Buffer.from(signed.serialize()).toString("base64") });
}
export async function confirmSignature(signature: string, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (signal?.aborted) return "pending";
    const result = await rilo<{ status: string }>(`transaction?signature=${encodeURIComponent(signature)}`, undefined, signal);
    if (["confirmed", "failed"].includes(result.status)) return result.status;
    await new Promise(resolve => window.setTimeout(resolve, 1700));
  }
  return "pending";
}
