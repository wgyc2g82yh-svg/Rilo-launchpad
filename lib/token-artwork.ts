import "server-only";
import { unstable_cache } from "next/cache";
import { cached } from "@/lib/integration-server";
import { rpc } from "@/lib/solana-rpc";
import { assetImageUrls } from "@/lib/token-image";
import type { Market } from "@/lib/integration-types";

export async function enrichArtwork(markets: Market[]): Promise<Market[]> {
  if (!process.env.SOLANA_RPC_URL) return markets;
  const mints = [...new Set(markets.filter(market => !market.imageUrl).map(market => market.mint))].sort();
  if (!mints.length) return markets;
  const artwork = new Map<string, string[]>();
  for (let offset = 0; offset < mints.length; offset += 30) {
    const ids = mints.slice(offset, offset + 30);
    const load = async () => {
      // Use only the configured RPC, never fetch token-supplied metadata URLs on the server.
      // Unsupported DAS methods or throttles must not break the market feed.
      const assets = await rpc<unknown>("getAssetBatch", { ids }).catch(() => []);
      return ids.map(mint => ({ mint, urls: Array.isArray(assets) ? assets.flatMap(asset => assetImageUrls(asset, mint)).slice(0, 2) : [] }));
    };
    const shared = process.env.GECKO_API_URL ? load : unstable_cache(load, ["token-artwork-v1", ids.join(",")], { revalidate: 60 });
    const result = await cached(`token-artwork:${ids.join(",")}`, 60_000, shared);
    for (const item of result) artwork.set(item.mint, item.urls);
  }
  return markets.map(market => {
    const urls = artwork.get(market.mint);
    return urls?.length ? { ...market, imageUrl: urls[0], fallbackImageUrl: urls[1] ?? market.fallbackImageUrl } : market;
  });
}
