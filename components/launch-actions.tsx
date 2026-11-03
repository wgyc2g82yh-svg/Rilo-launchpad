"use client";
import { useEffect, useRef, useState } from "react";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { phantomProvider, useWallet } from "@/components/wallet-provider";
import { confirmSignature, rilo, signBuilt } from "@/lib/rilo-client";
import type { BuiltTransaction } from "@/lib/integration-types";
import type { LaunchDraft } from "@/lib/launch-draft";
import { fromUnits } from "@/lib/integration-types";

type Curve = { creatorFeePercent: number; creationFeeLamports: string; graduationLamports: string; decimals: number; supplyRaw: string; permanentlyLockedLiquidityPercent: number };
export function LaunchActions({ draft }: { draft: LaunchDraft }) {
  const wallet = useWallet(), mintKey = useRef<Keypair | null>(null);
  const [built, setBuilt] = useState<BuiltTransaction | null>(null), [curve, setCurve] = useState<Curve | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [signature, setSignature] = useState("");
  useEffect(() => { const abort = new AbortController(); rilo<Curve>("curve", undefined, abort.signal).then(setCurve).catch(() => {}); return () => abort.abort(); }, []);
  useEffect(() => { setBuilt(null); mintKey.current = null; }, [wallet.address, draft]);
  async function prepare() {
    setBusy(true); setError(""); setMessage("");
    try {
      const provider = phantomProvider(); if (!wallet.address || !provider?.signMessage) throw new Error("Connect Phantom to authorize this token profile.");
      const key = mintKey.current ?? Keypair.generate(); mintKey.current = key;
      const challenge = await rilo<{ ticket: string; message: string }>("launch/challenge", { wallet: wallet.address, mint: key.publicKey.toBase58(), profile: draft });
      setMessage("Approve the profile authorization message in Phantom.");
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      setMessage("Storing metadata and simulating your launch…");
      const result = await rilo<BuiltTransaction>("launch/prepare", { ticket: challenge.ticket, signature: bs58.encode(signed.signature), profile: draft }); setBuilt(result); setMessage("");
    } catch (e) { setError(e instanceof Error ? e.message : "The launch could not be prepared."); setMessage(""); } finally { setBusy(false); }
  }
  async function launch() {
    if (!built) return; setBusy(true); setError("");
    try {
      setMessage("Review and approve the launch transaction in Phantom."); const result = await signBuilt(built, wallet.address, mintKey.current ?? undefined); setSignature(result.signature); setBuilt(null);
      setMessage("Launch submitted. Waiting for on-chain confirmation…"); const state = await confirmSignature(result.signature);
      setMessage(state === "confirmed" ? `Launch confirmed. Token mint: ${result.mint}` : state === "failed" ? "The launch transaction failed on-chain." : "Confirmation is pending. Check this signature before attempting another launch.");
    } catch (e) { setError(e instanceof Error ? e.message : "The launch was not confirmed. Check your wallet’s activity before retrying."); } finally { setBusy(false); }
  }
  return <div className="launch-actions"><h3>Fair-launch curve</h3>{curve ? <dl><div><dt>Supply</dt><dd>{fromUnits(curve.supplyRaw, curve.decimals)}</dd></div><div><dt>Graduation reserve</dt><dd>{fromUnits(curve.graduationLamports, 9)} SOL</dd></div><div><dt>Creation fee</dt><dd>{fromUnits(curve.creationFeeLamports, 9)} SOL + rent and network fees</dd></div><div><dt>Creator rebate</dt><dd>{curve.creatorFeePercent}% of distributable trading fees</dd></div><div><dt>Graduated liquidity</dt><dd>{curve.permanentlyLockedLiquidityPercent}% permanently locked</dd></div></dl> : <p className="subtle">The platform curve and metadata storage must be activated before a launch can be prepared.</p>}
    {built && <div className="form-note"><p>{built.summary}</p><p>Network: <strong>{built.network}</strong> · Estimated network fee: {built.networkFeeLamports ? `${fromUnits(built.networkFeeLamports, 9)} SOL` : "Unavailable"}. Rent and protocol costs are additional; review them in Phantom.</p><p className="address">Mint: {built.mint}</p></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-note" role="status">{message}</p>}{signature && <p className="address subtle">Transaction: {signature}</p>}
    {built ? <button className="metal-button" disabled={busy || !wallet.address} onClick={() => void launch()}>{busy ? "Awaiting approval…" : "Approve launch in wallet"}</button> : <button className="metal-button" disabled={busy || !curve || !wallet.address || Boolean(signature)} onClick={() => void prepare()}>{busy ? "Preparing…" : !wallet.address ? "Connect wallet to launch" : "Prepare launch"}</button>}
  </div>;
}
