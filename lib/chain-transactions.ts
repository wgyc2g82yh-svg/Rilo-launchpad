import "server-only";
import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { rpc } from "@/lib/solana-rpc";
import { digest, IntegrationError, seal, transactionNetwork, unseal } from "@/lib/integration-server";
import type { BuiltTransaction } from "@/lib/integration-types";
import { MAINNET_GENESIS } from "@/lib/integration-types";
import { isSolanaAddress } from "@/lib/token-analysis";

export function address(value: unknown): string {
  if (typeof value !== "string" || !isSolanaAddress(value)) throw new IntegrationError(400, "A valid Solana address is required.");
  return value;
}
export function chainConnection(): Connection {
  const endpoint = process.env.SOLANA_RPC_URL;
  if (!endpoint) throw new IntegrationError(503, "A Solana RPC connection is required for this action.");
  return new Connection(endpoint, { commitment: "confirmed", disableRetryOnRateLimit: true, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) });
}
export type TransactionTicket = { kind: "built"; wallet: string; message: string; expiresAt: number; action: string; genesis: string; mint?: string; pool?: string; config?: string };
export async function buildTransaction(transaction: Transaction, wallet: string, action: string, details: { mint?: string; pool?: string; config?: string; summary: string }): Promise<BuiltTransaction> {
  const genesis = await transactionNetwork();
  const latest = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
  transaction.feePayer = new PublicKey(wallet); transaction.recentBlockhash = latest.value.blockhash;
  const message = transaction.serializeMessage();
  const encoded = transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  const simulation = await rpc<{ value: { err: unknown } }>("simulateTransaction", [encoded, { encoding: "base64", commitment: "confirmed", sigVerify: false }]);
  if (simulation.value.err) throw new IntegrationError(422, "The transaction could not pass simulation. Check the wallet balance and pool configuration.");
  const fee = await rpc<{ value: number | null }>("getFeeForMessage", [message.toString("base64"), { commitment: "confirmed" }]).catch(() => ({ value: null }));
  const expiresAt = Date.now() + 60_000;
  const ticket = seal({ kind: "built", wallet, message: digest(message), action, expiresAt, genesis, mint: details.mint, pool: details.pool, config: details.config });
  return { transaction: encoded, ticket, expiresAt, networkFeeLamports: fee.value?.toString() ?? null, kind: action, network: genesis === MAINNET_GENESIS ? "mainnet" : "devnet", ...details };
}
export async function submitBuiltTransaction(body: Record<string, unknown>) {
  const genesis = await transactionNetwork();
  const ticket = unseal<TransactionTicket>(body.ticket, "built");
  if (genesis !== ticket.genesis) throw new IntegrationError(409, "The RPC network changed. Prepare this action again.");
  if (typeof body.transaction !== "string" || body.transaction.length > 5000 || !/^[A-Za-z0-9+/=]+$/.test(body.transaction)) throw new IntegrationError(400, "Invalid signed transaction.");
  let transaction;
  try { transaction = Transaction.from(Buffer.from(body.transaction, "base64")); } catch { throw new IntegrationError(400, "Invalid signed transaction."); }
  if (digest(transaction.serializeMessage()) !== ticket.message || transaction.feePayer?.toBase58() !== ticket.wallet || !transaction.verifySignatures()) throw new IntegrationError(400, "The signed transaction does not match the reviewed action.");
  const signature = await rpc<string>("sendTransaction", [body.transaction, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 }]);
  return { signature, status: "submitted", action: ticket.action, mint: ticket.mint, pool: ticket.pool, config: ticket.config, network: genesis === MAINNET_GENESIS ? "mainnet" : "devnet" };
}
export async function transactionStatus(signature: string) {
  try { if (bs58.decode(signature).length !== 64) throw new Error(); } catch { throw new IntegrationError(400, "Invalid transaction signature."); }
  const result = await rpc<{ value: ({ err: unknown; confirmationStatus: string | null } | null)[] }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
  const status = result.value[0];
  return { signature, status: status?.err ? "failed" : status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized" ? "confirmed" : "pending" };
}
export function versionedMessage(encoded: string, wallet: string) {
  let tx;
  try { tx = VersionedTransaction.deserialize(Buffer.from(encoded, "base64")); } catch { throw new IntegrationError(502, "The swap provider returned an unsupported transaction."); }
  const index = tx.message.staticAccountKeys.slice(0, tx.message.header.numRequiredSignatures).findIndex(key => key.toBase58() === wallet);
  if (index < 0) throw new IntegrationError(502, "The swap transaction does not include the connected wallet.");
  return { tx, index, hash: digest(tx.message.serialize()) };
}
export function verifyWalletSignature(transaction: VersionedTransaction, wallet: string, index: number) {
  return nacl.sign.detached.verify(transaction.message.serialize(), transaction.signatures[index], new PublicKey(wallet).toBytes());
}
