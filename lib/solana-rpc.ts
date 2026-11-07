import "server-only";

export class RpcError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function rpc<T>(method: string, params: unknown[] | Record<string, unknown> = []): Promise<T> {
  const endpoint = process.env.SOLANA_RPC_URL;
  if (!endpoint) throw new RpcError(503, "Live scans need a Solana RPC connection. Configure SOLANA_RPC_URL on your host.");
  // Only an operator-controlled endpoint is used. No arbitrary upstream URLs from requests.
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error();
  } catch { throw new RpcError(503, "The Solana RPC connection is not configured correctly."); }
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      signal: AbortSignal.timeout(8000), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) throw new RpcError(response.status === 429 ? 429 : 502, response.status === 429 ? "The RPC provider is busy. Try again shortly." : "The RPC provider is unavailable. Try again shortly.");
    const body = await response.json();
    if (body.error || !("result" in body)) throw new RpcError(502, "The RPC provider could not complete this check.");
    return body.result as T;
  } catch (error) {
    if (error instanceof RpcError) throw error;
    // Never expose a private endpoint, API key, provider body, or exception message.
    throw new RpcError(502, "The RPC connection timed out or could not be reached.");
  }
}
