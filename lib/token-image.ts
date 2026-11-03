export function tokenImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const raw = value.trim();
  const candidate = raw.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${raw.slice(7).replace(/^ipfs\//, "")}` : raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || /(?:^|\/)missing\.(png|svg)(?:$|\?)/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
