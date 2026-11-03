"use client";
import { useState } from "react";
import { tokenImageUrl } from "@/lib/token-image";
export function TokenAvatar({ imageUrl, symbol, large = false }: { imageUrl?: string | null; symbol: string; large?: boolean }) {
  const src = tokenImageUrl(imageUrl);
  return <AvatarImage key={src} src={src} symbol={symbol} large={large} />;
}
function AvatarImage({ src, symbol, large }: { src: string | null; symbol: string; large: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`token-avatar${large ? " token-avatar-large" : ""}`}>{src && !failed ? <img src={src} alt={`${symbol} token`} width={large ? 48 : 33} height={large ? 48 : 33} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-label={`${symbol} image unavailable`}>{symbol.slice(0, 2)}</span>}</span>;
}
