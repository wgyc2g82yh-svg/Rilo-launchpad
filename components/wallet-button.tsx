"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/wallet-provider";
export function WalletButton() {
  const wallet = useWallet(), [open, setOpen] = useState(false), [error, setError] = useState(""), [browse, setBrowse] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { setBrowse(`https://phantom.com/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`); }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  async function connect() { setError(""); try { await wallet.connect(); setOpen(false); } catch (error) { setError(error instanceof Error ? error.message : "Connection did not complete."); setOpen(true); } }
  async function disconnect() { try { await wallet.disconnect(); setOpen(false); } catch { setError("You can also disconnect this site inside Phantom."); } }
  return <><button className="metal-button wallet-button" disabled={wallet.busy} onClick={() => wallet.address ? setOpen(true) : void connect()}>{wallet.busy ? "Connecting…" : wallet.address ? `${wallet.address.slice(0,4)}…${wallet.address.slice(-4)}` : "Connect wallet"}</button>
    <dialog ref={dialog} className="rilo-dialog" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} aria-labelledby="wallet-title"><button className="dialog-close" aria-label="Close wallet dialog" onClick={() => setOpen(false)}>×</button><p className="eyebrow">WALLET CONNECTION</p><h2 id="wallet-title">{wallet.address ? "Your wallet" : "Connect with Phantom"}</h2>
      {wallet.address ? <><p className="address">{wallet.address}</p><button className="metal-button" disabled={wallet.busy} onClick={() => void disconnect()}>Disconnect</button></> : <><p>On iPhone, open RILO inside Phantom’s browser. On desktop, use the Phantom extension.</p>{browse && <a className="metal-button" href={browse}>Open in Phantom</a>}<button className="quiet-button" disabled={wallet.busy} onClick={() => void connect()}>Try connection again</button></>}
      {error && <p className="form-error" role="alert">{error}</p>}<p className="subtle">Your wallet reviews and approves each signature or transaction. RILO never asks for your recovery phrase or private keys.</p>
    </dialog></>;
}
