import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { DEVNET_GENESIS, MAINNET_GENESIS } from "@/lib/integration-types";
import { rpc, RpcError } from "@/lib/solana-rpc";

export class IntegrationError extends Error {
  status: number;
  constructor(status: number, message: string, public retryAfterMs?: number) { super(message); this.status = status; }
}
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function secret() {
  const key = process.env.APP_SIGNING_SECRET;
  if (!key || key.length < 32) throw new IntegrationError(503, "Wallet actions need the application signing secret configured.");
  return key;
}
export function seal(value: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret()).update(encoded).digest("base64url")}`;
}
export function unseal<T>(ticket: unknown, kind: string): T {
  if (typeof ticket !== "string" || ticket.length > 8000) throw new IntegrationError(400, "Invalid action ticket.");
  const [encoded, signature, extra] = ticket.split(".");
  if (!encoded || !signature || extra) throw new IntegrationError(400, "Invalid action ticket.");
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new IntegrationError(400, "The action could not be verified.");
  let value;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString()); } catch { throw new IntegrationError(400, "Invalid action ticket."); }
  if (value.kind !== kind || !Number.isFinite(value.expiresAt) || value.expiresAt < Date.now()) throw new IntegrationError(409, "This action expired. Review a fresh transaction.");
  return value as T;
}
export function trustedOrigin(): string {
  const raw = process.env.APP_ORIGIN;
  if (!raw) throw new IntegrationError(503, "The application origin must be configured for wallet actions.");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error();
    return url.origin;
  } catch { throw new IntegrationError(503, "The application origin is invalid."); }
}
export async function jsonBody(request: NextRequest, maxBytes = 20_000): Promise<Record<string, unknown>> {
  if (request.headers.get("origin") !== trustedOrigin()) throw new IntegrationError(403, "Open this action from the RILO website.");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new IntegrationError(415, "JSON content is required.");
  if (Number(request.headers.get("content-length")) > maxBytes) throw new IntegrationError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new IntegrationError(400, "Request body is missing.");
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) { const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > maxBytes) { await reader.cancel(); throw new IntegrationError(413, "Request is too large."); } chunks.push(next.value); }
  try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data; }
  catch { throw new IntegrationError(400, "Request contains invalid JSON."); }
}
export async function fetchProvider(url: string, init?: RequestInit): Promise<unknown> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json", ...init?.headers } });
    if (!response.ok) {
      const header = response.headers.get("Retry-After");
      const retryAfterMs = header ? /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now() : 60_000;
      throw new IntegrationError(response.status === 429 ? 429 : 502, response.status === 429 ? "The data provider is busy. Try again shortly." : "The service could not complete the request.", response.status === 429 ? Math.min(300_000, Math.max(10_000, Number.isFinite(retryAfterMs) ? retryAfterMs : 60_000)) : undefined);
    }
    return await response.json();
  } catch (error) { if (error instanceof IntegrationError) throw error; throw new IntegrationError(502, "The service timed out or could not be reached."); }
}
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
export async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const entry = cache.get(key); if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const pending = load().then(value => { if (cache.size >= 150) cache.delete(cache.keys().next().value!); cache.set(key, { expiresAt: Date.now() + ttl, value }); return value; }).finally(() => inflight.delete(key));
  inflight.set(key, pending); return pending;
}
let active = 0, windowAt = Date.now(), windowCount = 0;
export async function capacity<T>(action: () => Promise<T>): Promise<T> {
  if (Date.now() - windowAt > 60_000) { windowAt = Date.now(); windowCount = 0; }
  if (active >= 6 || windowCount >= 90) throw new IntegrationError(429, "Request capacity reached. Try again shortly.");
  active++; windowCount++;
  try { return await action(); } finally { active--; }
}
export async function transactionNetwork() {
  const genesis = await cached("genesis", 30_000, () => rpc<string>("getGenesisHash"));
  if (![MAINNET_GENESIS, DEVNET_GENESIS].includes(genesis)) throw new IntegrationError(422, "Wallet actions require a verified Solana mainnet or devnet RPC.");
  if (genesis === MAINNET_GENESIS) { if (process.env.ENABLE_MAINNET_TRANSACTIONS !== "true") throw new IntegrationError(503, "Mainnet wallet actions are not enabled by the operator yet."); }
  return genesis;
}
export function publicError(error: unknown): { error: string; status: number } {
  if (error instanceof IntegrationError || error instanceof RpcError) return { error: error.message, status: error.status };
  return { error: "This request could not be completed. No success has been confirmed.", status: 502 };
}
