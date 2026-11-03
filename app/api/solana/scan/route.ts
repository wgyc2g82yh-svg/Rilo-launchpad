import { NextRequest, NextResponse } from "next/server";
import { analyzeMint, isSolanaAddress, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from "@/lib/token-analysis";
import type { MintInfo, LargestAccount, Scan } from "@/lib/token-analysis";
import { rpc, RpcError } from "@/lib/solana-rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type AccountResponse = { context: { slot: number }; value: null | { owner: string; data: { parsed?: { type: string; info: MintInfo } } } };
// Per-instance protection and bounded caching; use an edge/WAF distributed limit in production.
const cache = new Map<string, { expires: number; scan: Scan }>();
let active = 0;
let windowStart = Date.now();
let requests = 0;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const mint = request.nextUrl.searchParams.get("mint")?.trim() ?? "";
  if (!isSolanaAddress(mint)) return NextResponse.json({ error: "Enter a valid Solana mint address." }, { status: 400, headers });
  const hit = cache.get(mint);
  if (hit && hit.expires > Date.now()) return NextResponse.json(hit.scan, { headers });
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
  if (active >= 4 || requests >= 30) return NextResponse.json({ error: "Scan capacity reached. Try again in a minute." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  active++; requests++;
  try {
    const account = await rpc<AccountResponse>("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
    if (!account.value) return NextResponse.json({ error: "No account exists at this address on the configured network." }, { status: 404, headers });
    if (![TOKEN_PROGRAM, TOKEN_2022_PROGRAM].includes(account.value.owner) || account.value.data.parsed?.type !== "mint") {
      return NextResponse.json({ error: "This address is not a supported SPL token mint. Paste the token address, rather than a wallet or pool address." }, { status: 422, headers });
    }
    // Independent RPC snapshots can differ; the UI makes the observation time explicit.
    const largest = await rpc<{ value: LargestAccount[] }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]).catch(() => null);
    const scan = analyzeMint(mint, account.value.owner, account.value.data.parsed.info, largest?.value ?? null, account.context.slot);
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(mint, { expires: Date.now() + 30_000, scan });
    return NextResponse.json(scan, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof RpcError ? error.message : "The provider returned data that could not be analyzed." }, { status: error instanceof RpcError ? error.status : 502, headers });
  } finally { active--; }
}
