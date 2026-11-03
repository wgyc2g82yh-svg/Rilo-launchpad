"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import type { IntegrationStatus } from "@/lib/integration-types";

type PublicKey = { toString(): string };
type Listener = (key?: PublicKey | null) => void;
export type PhantomProvider = {
  isPhantom?: boolean; publicKey?: PublicKey | null; isConnected?: boolean;
  connect(): Promise<{ publicKey: PublicKey }>; disconnect(): Promise<void>;
  on(event: string, listener: Listener): void; removeListener(event: string, listener: Listener): void;
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array }>;
  signTransaction?<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
};
export function phantomProvider(): PhantomProvider | null {
  const host = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  const provider = host.phantom?.solana ?? host.solana;
  return provider?.isPhantom ? provider : null;
}
type WalletState = { address: string; busy: boolean; status: IntegrationStatus | null; connect(): Promise<void>; disconnect(): Promise<void> };
const WalletContext = createContext<WalletState | null>(null);
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState(""), [busy, setBusy] = useState(false), [status, setStatus] = useState<IntegrationStatus | null>(null);
  const cleanup = useRef<() => void>(() => {}), attached = useRef<PhantomProvider | null>(null);
  const attach = useCallback((provider: PhantomProvider) => {
    if (attached.current === provider) return; cleanup.current();
    const changed: Listener = key => setAddress(key?.toString() ?? ""), disconnected: Listener = () => setAddress("");
    provider.on("connect", changed); provider.on("accountChanged", changed); provider.on("disconnect", disconnected);
    attached.current = provider;
    cleanup.current = () => { provider.removeListener("connect", changed); provider.removeListener("accountChanged", changed); provider.removeListener("disconnect", disconnected); attached.current = null; };
  }, []);
  useEffect(() => {
    const abort = new AbortController(), provider = phantomProvider();
    if (provider) { attach(provider); if (provider.isConnected && provider.publicKey) setAddress(provider.publicKey.toString()); }
    fetch("/api/rilo/status", { signal: abort.signal }).then(r => r.ok ? r.json() : null).then(setStatus).catch(() => {});
    return () => { cleanup.current(); abort.abort(); };
  }, [attach]);
  async function connect() {
    const provider = phantomProvider(); if (!provider) throw new Error("Open RILO in Phantom’s browser on your phone, or install its desktop extension.");
    attach(provider); setBusy(true);
    try { const result = await provider.connect(); setAddress(result.publicKey.toString()); } finally { setBusy(false); }
  }
  async function disconnect() { setBusy(true); try { await phantomProvider()?.disconnect(); setAddress(""); } finally { setBusy(false); } }
  return <WalletContext.Provider value={{ address, busy, status, connect, disconnect }}>{children}</WalletContext.Provider>;
}
export function useWallet() { const context = useContext(WalletContext); if (!context) throw new Error("WalletProvider is missing."); return context; }
