import "server-only";
import { unstable_cache } from "next/cache";
import { cached } from "@/lib/integration-server";
import { rpc } from "@/lib/solana-rpc";
import { assetImageUrls } from "@/lib/token-image";
import type { Market } from "@/lib/integration-types";

export async function resolveArtwork(mints: string[]): Promise<{ mint: string; imageUrl: string | null; fallbackImageUrl: string | null }[]> {
  if (!process.env.SOLANA_RPC_URL || !mints.length) return [];
  mints = [...new Set(mints)].sort();
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
  return [...artwork].map(([mint, urls]) => ({ mint, imageUrl: urls[0] ?? null, fallbackImageUrl: urls[1] ?? null }));
}
export async function enrichArtwork(markets: Market[]): Promise<Market[]> {
  const artwork = new Map((await resolveArtwork(markets.filter(market => !market.imageUrl).map(market => market.mint))).map(item => [item.mint, item]));
  return markets.map(market => {
    const image = artwork.get(market.mint);
    return image?.imageUrl ? { ...market, imageUrl: image.imageUrl, fallbackImageUrl: image.fallbackImageUrl } : market;
  });
}
