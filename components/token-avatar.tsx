"use client";
import { useEffect, useState } from "react";
import { tokenImageCandidates } from "@/lib/token-image";
export function TokenAvatar({ imageUrl, fallbackImageUrl, symbol, large = false }: { imageUrl?: string | null; fallbackImageUrl?: string | null; symbol: string; large?: boolean }) {
  const sources = tokenImageCandidates(imageUrl, fallbackImageUrl);
  return <AvatarImage key={sources.join("|")} sources={sources} symbol={symbol} large={large} />;
}
function AvatarImage({ sources, symbol, large }: { sources: string[]; symbol: string; large: boolean }) {
  const [index, setIndex] = useState(0), [failed, setFailed] = useState(false), [round, setRound] = useState(0);
  // A mobile connection or gateway can fail briefly. Retry once after backoff,
  // including after returning online; stop after that instead of looping forever.
  useEffect(() => {
    if (!failed || !sources.length || round >= 1) return;
    const retry = () => { setIndex(0); setFailed(false); setRound(1); };
    const timer = window.setTimeout(retry, 8000);
    window.addEventListener("online", retry, { once: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("online", retry); };
  }, [failed, sources.length, round]);
  return <span className={`token-avatar${large ? " token-avatar-large" : ""}`}>{sources[index] && !failed ? <img key={`${index}:${round}`} src={sources[index]} alt={`${symbol} token`} width={large ? 48 : 33} height={large ? 48 : 33} loading={large ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => { if (index + 1 < sources.length) setIndex(index + 1); else setFailed(true); }} /> : <span aria-label={`${symbol} image unavailable`}>{symbol.slice(0, 2)}</span>}</span>;
}
