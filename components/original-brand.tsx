"use client";

import { useEffect, useId, useState } from "react";
import type { CSSProperties } from "react";

type State = "pending" | "clear" | "flagged" | "unavailable";
type Check = { state: State; summary: string; evidence: string[] };
// Optional market data: one-minute candles; Unix millisecond times and USD volume.
type Candle = { time: number; open: number; high: number; low: number; close: number; volumeUsd?: number | null };
type Token = {
  mint: string; name: string; symbol: string; marketCap: number | null;
  holders: number | null; bundledSupplyPct: number | null; updatedAt: string;
  volume24h?: number | null; change24h?: number | null; priceHistory?: number[];
  priceUsd?: number | null; candles?: Candle[];
  checks: { bundle: Check; developer: Check; concentration: Check };
};
const KEYS = ["bundle", "developer", "concentration"] as const;
const TITLES = { bundle: "Bundle detection", developer: "Developer history", concentration: "Holder concentration" };
const fresh = () => new Date().toISOString();
const check = (state: State, summary: string, evidence: string[] = []): Check => ({ state, summary, evidence });
function demoCandles(history: number[], price: number, time: number): Candle[] {
  const end = Math.floor(time / 60000) * 60000;
  const scale = price / history[history.length - 1];
  let previous = history[0] * scale;
  return Array.from({ length: 64 }, (_, i) => {
    const position = i / 63 * (history.length - 1), index = Math.floor(position);
    const base = (history[index] + ((history[index + 1] ?? history[index]) - history[index]) * (position - index)) * scale;
    const close = i === 63 ? price : base * (1 + Math.sin(i * 2.9) * .021);
    const open = previous; previous = close;
    const spread = Math.max(open, close) * (.008 + (i * 7 % 11) / 950);
    return { time: end - (63 - i) * 60000, open, close, high: Math.max(open, close) + spread, low: Math.max(0, Math.min(open, close) - spread), volumeUsd: Math.round(240 + Math.abs(close - open) / price * 48000 + (i * 127 % 1700)) };
  });
}
function examples(): Token[] {
  const updatedAt = fresh();
  const tokens: Token[] = [
    { mint: "demo-pepe", name: "PepeAI", symbol: "PEPEAI", marketCap: 84200, holders: 284, bundledSupplyPct: 34, updatedAt, volume24h:418600, change24h:24.8, priceHistory:[18,22,19,28,24,32,29,40,36,44,41,54,49,57,54,67],
      checks: { bundle: check("flagged", "A connected group controls 34% of supply.", ["14 wallets share a funding source.", "Coordinated buys appeared in the first blocks.", "These are fictional findings for interface preview."]), developer: check("clear", "No historical flags in this example.", ["Three example launches reviewed."]), concentration: check("flagged", "Supply is concentrated in a linked group.", ["The connected group holds 34% of supply."]) } },
    { mint: "demo-doge", name: "DogeX", symbol: "DOGEX", marketCap: 142000, holders: 418, bundledSupplyPct: 2, updatedAt, volume24h:342800, change24h:62.1, priceHistory:[15,20,17,24,30,25,37,44,40,50,48,62,58,70,67,82],
      checks: { bundle: check("clear", "No major bundle patterns in this example.", ["Estimated linked supply: 2%."]), developer: check("clear", "No historical flags in this example.", ["Two example launches reviewed."]), concentration: check("clear", "No major concentration flags in this example.", ["Largest non-pool wallet: 3.1%."]) } },
    { mint: "demo-moon", name: "MoonWif", symbol: "MWIF", marketCap: 21400, holders: 126, bundledSupplyPct: 18, updatedAt, volume24h:96400, change24h:-8.2, priceHistory:[72,67,70,61,66,57,62,53,58,50,54,47,49,42,46,39],
      checks: { bundle: check("clear", "No coordinated purchase pattern established in this example."), developer: check("flagged", "Previous launches contain suspicious liquidity-removal events.", ["Two fictional prior launches are flagged.", "Liquidity was removed soon after launch.", "A warning is an indicator to inspect, not proof of wrongdoing."]), concentration: check("flagged", "One example wallet holds 18% of supply.", ["Large-holder exposure should be reviewed."]) } },
    { mint: "demo-chill", name: "ChillCat", symbol: "CHILL", marketCap: 63800, holders: 302, bundledSupplyPct: null, updatedAt, volume24h:125300, change24h:18.6, priceHistory:[22,28,25,32,30,35,31,40,37,44,42,49,45,54,50,60],
      checks: { bundle: check("pending", "Wallet relationships are awaiting analysis."), developer: check("pending", "Developer history has not been checked."), concentration: check("pending", "Holder distribution has not been checked.") } },
  ];
  return tokens.map(token => {
    const priceUsd = (token.marketCap ?? 10000) / 1_000_000_000;
    return { ...token, priceUsd, candles: demoCandles(token.priceHistory ?? [1, 2], priceUsd, Date.parse(updatedAt)) };
  });
}
function result(token: Token): State {
  const all = KEYS.map((key) => token.checks[key].state);
  return all.includes("flagged") ? "flagged" : all.every((state) => state === "clear") ? "clear" : all.includes("unavailable") ? "unavailable" : "pending";
}
function statusLabel(state: State) { return state === "clear" ? "No major flags" : state === "flagged" ? "Risk flags detected" : state === "pending" ? "Analysis pending" : "Data unavailable"; }
function money(value: number | null) { return value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value); }

export function OriginalIcon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    launch: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6.05 11A22 22 0 0 1 12 15ZM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0m1 7v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
    compass: "m16.5 7.5-3 6-6 3 3-6 6-3ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    trending: "m3 17 6-6 4 4 8-10m-6 0h6v6",
    pulse: "M2 12h5l3-8 4 16 3-8h5", star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z",
    activity: "M4 18V9m5 9V5m5 13v-7m5 7V3", book: "M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v15c-4-1-6 0-9 1-3-1-5-2-9-1V4Z",
    arrow: "M5 19 19 5M5 5h14v14", search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm5.5-2 5 5",
    wallet: "M3 7V5a2 2 0 0 1 2-2h14v4M3 7h18v14H3V7Zm18 5h-6v4h6m-4-2h.01",
    link: "m10 13 4-4m-6 5-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m2 4 1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0",
    warning: "m12 3 10 18H2L12 3Zm0 6v5m0 3v.1", check: "m5 12 4 4L19 6", back: "M20 12H4m7-7-7 7 7 7",
    close: "m6 6 12 12M6 18 18 6", copy: "M8 8h12v13H8V8ZM4 16H3V3h12v1", play: "m8 5 11 7-11 7V5Z",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.compass} /></svg>;
}
export function OriginalBrand({ size = 44 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // The mark is an inline vector: there is no image background, box, or asset path.
  const outline = "M3 4H194C254 4 294 42 294 100C294 144 266 181 218 194L293 313C246 313 208 290 181 251L120 154H179C210 154 230 135 230 105C230 79 208 64 176 64H111C63 64 28 43 3 4Z";
  return <span className="rt-mark" style={{ "--mark": `${size}px` } as CSSProperties}>
    <svg viewBox="0 0 300 320" width={size} height={size} role="img" aria-label="Rilo R logo">
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff"/><stop offset=".13" stopColor="#a8a8a8"/>
          <stop offset=".3" stopColor="#6b6b6b"/><stop offset=".47" stopColor="#e9e9e9"/>
          <stop offset=".58" stopColor="#fff"/><stop offset=".72" stopColor="#b9b9b9"/>
          <stop offset=".89" stopColor="#f6f6f6"/><stop offset="1" stopColor="#9d9d9d"/>
        </linearGradient>
        <radialGradient id={`${id}-light`} cx="83%" cy="31%" r="68%">
          <stop stopColor="#fff" stopOpacity=".72"/><stop offset=".45" stopColor="#fff" stopOpacity=".1"/>
          <stop offset="1" stopColor="#343434" stopOpacity=".17"/>
        </radialGradient>
      </defs>
      <path d={outline} fill={`url(#${id}-metal)`}/>
      <path d={outline} fill={`url(#${id}-light)`}/>
      <path d="M3 4C45 31 77 34 139 34H176C215 34 246 55 246 91C246 65 221 64 176 64H111C63 64 28 43 3 4Z" fill="#fff" opacity=".25"/>
      <path d="M120 154L193 247C219 281 248 303 293 313C246 313 208 290 181 251Z" fill="#fff" opacity=".42"/>
      <path d="M5 4H194C254 4 294 42 294 100M120 154L193 247C219 281 248 303 291 312" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4"/>
    </svg>
  </span>;
}

function Background() {
  return <div className="rt-background" aria-hidden="true"/>;
}

export function Network({ danger = false }: { danger?: boolean }) {
  const nodes = [
    [43,72],[78,38],[125,58],[65,116],[102,151],[33,174],[142,193],
    [189,37],[237,25],[280,51],[326,29],[365,62],[407,94],
    [330,116],[393,150],[349,192],[299,213],[248,184],[214,219],[173,155],
  ];
  return <svg className={`rt-network rt-network2 ${danger ? "rt-network-danger" : ""}`} viewBox="0 0 440 248" fill="none" role="img" aria-label="Illustrative animated wallet graph showing funding paths and connected wallet clusters">
    <path d="M0 62H440M0 124H440M0 186H440M73 0V248M147 0V248M220 0V248M293 0V248M367 0V248" stroke="currentColor" strokeOpacity=".045"/>
    <ellipse cx="86" cy="107" rx="72" ry="88" stroke="currentColor" strokeOpacity=".18" strokeDasharray="2 5" fill="currentColor" fillOpacity=".025"/>
    <circle cx="220" cy="121" r="78" stroke="currentColor" strokeOpacity=".055"/>
    <circle cx="220" cy="121" r="105" stroke="currentColor" strokeOpacity=".035"/>
    {nodes.map(([x,y], i) => {
      const sx = i < 7 ? 86 : 220, sy = i < 7 ? 107 : 121;
      const path = `M${sx} ${sy}Q${(sx+x)/2+14} ${(sy+y)/2-19} ${x} ${y}`;
      return <g key={i} className={i < 7 ? "rt-linked-node" : ""}>
        <path d={path} stroke="currentColor" strokeOpacity={i < 7 ? ".36" : ".18"}/>
        <path className="rt-packet" pathLength="100" d={path} stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 97" style={{animationDelay:`${i * -.27}s`,animationDuration:`${2.4+i*.08}s`}}/>
        <circle className="rt-wallet-halo" cx={x} cy={y} r="9" stroke="currentColor" strokeOpacity=".18" style={{animationDelay:`${i * -.31}s`}}/>
        <circle cx={x} cy={y} r={i < 7 ? 4 : 3} fill="currentColor" fillOpacity={i < 7 ? ".8" : ".55"}/>
        {i % 3 === 0 && <text x={x+10} y={y+3} fill="currentColor" fillOpacity=".45" stroke="none" fontSize="6" fontFamily="monospace">W{String(i+1).padStart(2,"0")}</text>}
      </g>;
    })}
    <path d="M86 107Q148 66 220 121" stroke="currentColor" strokeOpacity=".55"/>
    <path className="rt-packet" pathLength="100" d="M86 107Q148 66 220 121" stroke="currentColor" strokeWidth="2.6" strokeDasharray="5 95"/>
    <circle cx="86" cy="107" r="13" stroke="currentColor" strokeOpacity=".5" fill="#131313"/>
    <circle cx="86" cy="107" r="4" fill="currentColor"/>
    <circle className="rt-hub-ring" cx="220" cy="121" r="31" stroke="currentColor" strokeDasharray="9 13 4 20" strokeOpacity=".65"/>
    <circle className="rt-hub-pulse" cx="220" cy="121" r="22" stroke="currentColor" strokeOpacity=".35"/>
    <circle cx="220" cy="121" r="21" stroke="currentColor" strokeOpacity=".5" fill="#131313"/>
    <path d="M212 121h16m-8-8v16" stroke="currentColor" strokeOpacity=".4"/>
    <circle cx="220" cy="121" r="5" fill="currentColor"/>
    <path className="rt-net-sweep" d="M5 0H435" stroke="currentColor" strokeOpacity=".24"/>
    <text x="16" y="18" fill="currentColor" fillOpacity=".55" fontSize="6" fontFamily="monospace" letterSpacing="1">FUNDING CLUSTER</text>
    <text x="194" y="166" fill="currentColor" fillOpacity=".6" fontSize="6" fontFamily="monospace" letterSpacing="1">LAUNCH</text>
    <text x="16" y="238" fill="currentColor" fillOpacity=".4" fontSize="6" fontFamily="monospace" letterSpacing="1">ILLUSTRATIVE WALLET GRAPH</text>
  </svg>;
}

function SignalEngine({ tokens, mode }: { tokens: Token[]; mode: "preview" | "live" }) {
  const [step, setStep] = useState(3);
  useEffect(() => {
    if (mode !== "preview") return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (!motion.matches) timer = setInterval(() => {
        if (!document.hidden) setStep(s => (s + 1) % 12);
      }, 2000);
    };
    start(); motion.addEventListener("change", start);
    return () => { clearInterval(timer); motion.removeEventListener("change", start); };
  }, [mode]);
  const candidates = tokens.filter(t => t.mint !== "demo-chill");
  const current = candidates.length ? candidates[(mode === "preview" ? Math.floor(step/4) : 0) % candidates.length] : undefined;
  const phase = mode === "preview" ? step % 4 : 3;
  const state = current ? result(current) : "unavailable";
  const outcome = !current ? "WAITING FOR LAUNCH DATA" : phase < 3 ? "TRACING THE LAUNCH" :
    current.checks.developer.state === "flagged" ? "DEVELOPER HISTORY FLAG" :
    current.checks.bundle.state === "flagged" ? "BUNDLE DETECTED" :
    state === "clear" ? "NO MAJOR FLAGS" : statusLabel(state).toUpperCase();
  const order = ["bundle", "developer", "concentration"] as const;
  const linked = current?.bundledSupplyPct;
  return <div className="rt-engine rt-glass rt-engine-v2" data-engine-state={phase < 3 ? "pending" : state}>
    <div className="rt-panel-label"><span>SIGNAL ENGINE <em>01 / RILO</em></span><span className="rt-engine-mode"><span className="rt-dot"/>{mode === "preview" ? "SIMULATION" : "SUPPLIED DATA"}</span></div>
    <div className="rt-engine-token"><span className="rt-engine-symbol">{current ? `$${current.symbol}` : "AWAITING FEED"}<small>{mode === "preview" ? "DEMO LAUNCH / SOLANA" : "TOKEN / SOLANA"}</small></span><span className="rt-engine-cycle">{mode === "preview" ? `0${phase+1} / 04` : "ANALYSIS"}<i>{phase < 3 ? "PROCESSING" : "LATEST RESULT"}</i></span></div>
    <div className="rt-engine-visual">
      {mode === "preview" ? <Network danger={phase >= 1 && current?.checks.bundle.state === "flagged"}/> : <div className="rt-engine-live-graph"><OriginalIcon name="pulse" size={30}/><span>{current ? "Reading supplied analysis" : "Waiting for connected data"}</span><small>Wallet edges are not included in this feed.</small></div>}
      <div className="rt-engine-legend"><span><i/> FUNDING PATH</span><span><i/> WALLET</span><span>SUPPLY / HISTORY</span></div>
    </div>
    <div className="rt-engine-stats"><div><small>HOLDERS</small><strong>{current?.holders?.toLocaleString("en-US") ?? "—"}</strong></div><div><small>LINKED SUPPLY</small><strong>{phase >= 1 && linked != null ? `${linked}%` : "—"}</strong></div><div><small>CHECKS RESOLVED</small><strong>{current ? order.filter((key,i) => phase > i && ["clear","flagged"].includes(current.checks[key].state)).length : 0}<span> / 3</span></strong></div></div>
    <div className="rt-engine-checks">{order.map((key,i) => {
      const finding = current?.checks[key];
      const resolved = !!finding && phase > i;
      const status: State = resolved ? finding.state : current ? "pending" : "unavailable";
      return <div className={`rt-engine-check rt-check-${status}`} key={key}>
        <span className="rt-engine-check-icon"><OriginalIcon name={key === "bundle" ? "link" : key === "developer" ? "warning" : "activity"} size={15}/></span>
        <div><strong>{TITLES[key]}</strong><p>{resolved ? finding.summary : current ? ["Tracing common funding and purchase timing…","Reviewing previous launch activity…","Mapping the distribution of supply…"][i] : "Analysis data unavailable"}</p></div>
        <span className="rt-engine-check-state"><OriginalIcon name={status === "clear" ? "check" : status === "flagged" ? "warning" : "pulse"} size={13}/><small>{status === "clear" ? "CLEAR" : status === "flagged" ? "FLAG" : status === "unavailable" ? "N/A" : "SCAN"}</small></span>
      </div>;
    })}</div>
    <div className={`rt-engine-verdict rt-verdict-${phase < 3 ? "pending" : state}`}>
      <OriginalIcon name={phase < 3 ? "pulse" : state === "clear" ? "check" : state === "flagged" ? "warning" : "pulse"} size={17}/><div><small>RILO SIGNAL</small><strong>{outcome}</strong></div><div className="rt-bars" aria-hidden="true">{Array.from({length:12},(_,i) => <i key={i} style={{height:5+(i*7)%19,animationDelay:`${i*-.19}s`}}/>)}</div>
    </div>
    <div className="rt-engine-bottom"><span>{mode === "preview" ? "ILLUSTRATIVE ANALYSIS · DEMO DATA" : "RESULTS FROM CONNECTED FEED"}</span><span>{mode === "preview" ? "AUTO-CYCLING" : "SOLANA"}</span></div>
  </div>;
}


export function OriginalBackground() {
  return <><Background/><div className="rt-metal-field" aria-hidden="true"><div className="rt-metal-wave rt-metal-wave-one"/><div className="rt-metal-wave rt-metal-wave-two"/><div className="rt-metal-wave rt-metal-wave-three"/></div></>;
}
export function OriginalHero({onExplore,onTechnology}: {onExplore():void;onTechnology():void}) {
  const [demo] = useState(examples);
  return <section className="rt-hero"><div className="rt-hero-copy"><div className="rt-eyebrow"><span className="rt-dot"/> THE LAUNCH INTELLIGENCE LAYER</div><h1 className="rt-powered">POWERED BY <span>RILO</span></h1><p>See bundled supply, connected wallets, and developer history. Every signal, right where you trade.</p><div className="rt-hero-actions"><button className="rt-primary" onClick={onExplore}>Explore tokens</button><button className="rt-secondary" onClick={onTechnology}>Explore the technology</button></div><div className="rt-hero-meta"><span>◎ SOLANA</span><i/><span>ON-CHAIN MARKETS</span><i/><span>ENGINE PREVIEW</span></div></div><SignalEngine tokens={demo} mode="preview"/></section>;
}
