export function tokenImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  const raw = value.trim();
  const candidate = raw.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${raw.slice(7).replace(/^ipfs\//, "")}` : raw.startsWith("ar://") ? `https://arweave.net/${raw.slice(5)}` : raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || /(?:^|\/)missing\.(png|svg)(?:$|\?)/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

// Keep the provider URL first, then try independent gateways for the same IPFS content.
export function tokenImageCandidates(...values: unknown[]): string[] {
  const sources = [...new Set(values.map(tokenImageUrl).filter((url): url is string => Boolean(url)))];
  const gateways: string[] = [];
  for (const source of sources) {
    const url = new URL(source);
    const path = url.pathname.match(/^\/ipfs\/([^/]+)(.*)$/);
    const subdomain = url.hostname.match(/^([^.]+)\.ipfs\./);
    const cid = path?.[1] ?? subdomain?.[1];
    if (!cid || !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]+)$/.test(cid)) continue;
    const suffix = path?.[2] ?? url.pathname;
    for (const host of ["https://ipfs.io", "https://gateway.pinata.cloud", "https://dweb.link"]) {
      gateways.push(`${host}/ipfs/${cid}${suffix}${url.search}`);
    }
  }
  return [...new Set([...sources, ...gateways])].slice(0, 6);
}

// DAS responses may include unrelated or non-image files. Match the mint explicitly.
export function assetImageUrls(value: unknown, mint: string): string[] {
  if (!value || typeof value !== "object") return [];
  const asset = value as { id?: unknown; content?: { links?: { image?: unknown }; files?: { uri?: unknown; cdn_uri?: unknown; mime?: unknown }[] } };
  if (asset.id !== mint) return [];
  const files = Array.isArray(asset.content?.files) ? asset.content.files : [];
  const images = files.filter(file => file && typeof file.mime === "string" && file.mime.startsWith("image/"));
  return [...new Set([asset.content?.links?.image, ...images.flatMap(file => [file.cdn_uri, file.uri])].map(tokenImageUrl).filter((url): url is string => Boolean(url)))].slice(0, 2);
}
