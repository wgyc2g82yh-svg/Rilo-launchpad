"use client";

import { useEffect, useRef, useState } from "react";

type PublicKey = { toString(): string };
type Listener = (key?: PublicKey | null) => void;
type Provider = {
  isPhantom?: boolean; publicKey?: PublicKey | null; isConnected?: boolean;
  connect(): Promise<{ publicKey: PublicKey }>; disconnect(): Promise<void>;
  on(event: string, listener: Listener): void; removeListener(event: string, listener: Listener): void;
};
function getProvider(): Provider | null {
  const host = window as unknown as { phantom?: { solana?: Provider }; solana?: Provider };
  const provider = host.phantom?.solana ?? host.solana;
  return provider?.isPhantom ? provider : null;
}
const short = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;

export function WalletButton() {
  const [address, setAddress] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [browse, setBrowse] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const attached = useRef<Provider | null>(null);

  function attach(provider: Provider) {
    if (attached.current === provider) return;
    cleanup.current();
    const changed: Listener = key => setAddress(key?.toString() ?? "");
    const disconnected: Listener = () => setAddress("");
    provider.on("connect", changed);
    provider.on("accountChanged", changed);
    provider.on("disconnect", disconnected);
    cleanup.current = () => {
      provider.removeListener("connect", changed);
      provider.removeListener("accountChanged", changed);
      provider.removeListener("disconnect", disconnected);
      attached.current = null;
    };
    attached.current = provider;
  }

  useEffect(() => {
    const provider = getProvider();
    if (provider) {
      attach(provider);
      if (provider.isConnected && provider.publicKey) setAddress(provider.publicKey.toString());
    }
    setBrowse(`https://phantom.com/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`);
    return () => cleanup.current();
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal(); else dialog.current?.close();
  }, [open]);

  async function connect() {
    const provider = getProvider();
    if (!provider) { setOpen(true); return; }
    attach(provider);
    setBusy(true); setError("");
    try {
      const result = await provider.connect();
      setAddress(result.publicKey.toString()); setOpen(false);
    } catch { setError("Connection was declined or could not complete. Open Phantom and try again."); setOpen(true); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError("");
    try { await getProvider()?.disconnect(); setAddress(""); setOpen(false); }
    catch { setError("Could not disconnect. You can disconnect this site inside Phantom."); }
    finally { setBusy(false); }
  }

  return <>
    <button className="metal-button wallet-button" disabled={busy} onClick={() => address ? setOpen(true) : void connect()}>{busy ? "Connecting…" : address ? short(address) : "Connect wallet"}</button>
    <dialog ref={dialog} className="rilo-dialog" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} aria-labelledby="wallet-title">
      <button className="dialog-close" aria-label="Close wallet dialog" onClick={() => setOpen(false)}>×</button>
      <p className="eyebrow">WALLET CONNECTION</p><h2 id="wallet-title">{address ? "Your wallet" : "Connect with Phantom"}</h2>
      {address ? <><p className="address">{address}</p><button className="metal-button" disabled={busy} onClick={() => void disconnect()}>Disconnect</button></> : <>
        <p>On iPhone, open RILO inside Phantom’s browser. On desktop, use a browser with the Phantom extension.</p>
        {browse && <a className="metal-button" href={browse}>Open in Phantom</a>}
        <button className="quiet-button" disabled={busy} onClick={() => void connect()}>Try connection again</button>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="subtle">Connecting shares your public wallet address. This version does not request signatures or submit transactions.</p>
    </dialog>
  </>;
}
