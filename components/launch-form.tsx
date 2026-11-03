"use client";

import { useEffect, useRef, useState } from "react";
import { DRAFT_KEY, EMPTY_DRAFT, readDraft, validateDraft } from "@/lib/launch-draft";
import type { LaunchDraft } from "@/lib/launch-draft";

export function LaunchForm() {
  const [draft, setDraft] = useState<LaunchDraft>({ ...EMPTY_DRAFT });
  const [ready, setReady] = useState(false);
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const readerRef = useRef<FileReader | null>(null);
  const revision = useRef(0);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) setDraft(readDraft(JSON.parse(stored)));
    } catch { setNotice("Your saved draft could not be restored. You can start a new one."); }
    setReady(true);
    return () => readerRef.current?.abort();
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); setSaved(true); }
      catch { setNotice("Your browser could not save this draft. Try removing the image or freeing storage."); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, ready]);

  function update(key: keyof LaunchDraft, value: string) {
    setDraft(current => ({ ...current, [key]: value })); setErrors([]); setNotice("");
  }
  function image(file?: File) {
    revision.current++;
    readerRef.current?.abort();
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrors(["Use a PNG, JPG, or WebP image up to 2 MB."]); return;
    }
    const currentRevision = revision.current;
    const reader = new FileReader(); readerRef.current = reader;
    reader.onload = () => { if (currentRevision === revision.current) update("image", String(reader.result)); };
    reader.onerror = () => setErrors(["The image could not be read. Choose it again."]);
    reader.readAsDataURL(file);
  }
  function reset() {
    revision.current++; readerRef.current?.abort();
    setDraft({ ...EMPTY_DRAFT }); setErrors([]); setReview(false); setNotice("");
    if (upload.current) upload.current.value = "";
  }
  const displayImage = /^data:image\/(png|jpeg|webp);base64,/.test(draft.image) ? draft.image : "";

  return <section className="launch-layout">
    <div className="panel launch-panel">
      <div className="panel-heading"><div><p className="eyebrow">CREATE A TOKEN</p><h2>{review ? "Review your launch" : "Start with your vision."}</h2></div><span className="step-label">0{review ? 2 : 1} / 02</span></div>
      <div className="steps"><span className={!review ? "current" : ""}>01 Profile</span><span className={review ? "current" : ""}>02 Review</span></div>
      {notice && <p className="form-note" role="status">{notice}</p>}
      {errors.length > 0 && <div className="form-error" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
      {!review ? <form onSubmit={event => { event.preventDefault(); const next = validateDraft(draft); setErrors(next); if (!next.length) setReview(true); }}>
        <div className="field-row"><label>Token name<input required maxLength={32} value={draft.name} onChange={event => update("name", event.target.value)} placeholder="Your token name" autoComplete="off" /></label><label>Ticker<input required minLength={2} maxLength={10} pattern="[A-Z0-9]{2,10}" value={draft.ticker} onChange={event => update("ticker", event.target.value.toUpperCase())} placeholder="TOKEN" autoComplete="off" /></label></div>
        <label>Description<span className="field-hint">{draft.description.length} / 500</span><textarea maxLength={500} value={draft.description} onChange={event => update("description", event.target.value)} placeholder="Tell the community what you’re building." rows={4} /></label>
        <div className="field-row"><label>Website <span className="optional">optional</span><input type="url" maxLength={2048} value={draft.website} onChange={event => update("website", event.target.value)} placeholder="https://" /></label><label>X username <span className="optional">optional</span><input maxLength={15} value={draft.x} onChange={event => update("x", event.target.value.replace(/^@/, ""))} placeholder="username" autoComplete="off" /></label></div>
        <label className="upload-label">Token image <span className="optional">optional · PNG / JPG / WebP · 2 MB max</span><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => image(event.target.files?.[0])} /></label>
        {displayImage && <div className="image-preview"><img src={displayImage} alt="Token image preview" width="72" height="72" /><button type="button" className="quiet-button" onClick={() => { revision.current++; readerRef.current?.abort(); update("image", ""); if (upload.current) upload.current.value = ""; }}>Remove image</button></div>}
        <div className="form-actions"><span className="subtle" role="status">{saved ? "Draft saved on this device" : "Saving draft…"}</span><button className="metal-button" disabled={!ready}>Review launch</button></div>
      </form> : <div className="launch-review">
        <div className="review-profile">{displayImage ? <img src={displayImage} alt="Your token" width="72" height="72" /> : <div className="token-placeholder">{draft.ticker.slice(0, 1)}</div>}<div><h3>{draft.name}</h3><p className="mono">${draft.ticker}</p></div></div>
        <p className="review-description">{draft.description || "No description added."}</p>
        <dl><div><dt>Website</dt><dd>{draft.website || "Not added"}</dd></div><div><dt>X</dt><dd>{draft.x ? `@${draft.x}` : "Not added"}</dd></div><div><dt>Deployment</dt><dd>Not connected</dd></div></dl>
        <p className="form-note">Your profile is ready. On-chain deployment, launch fees, and liquidity setup still need integration before tokens can be launched.</p>
        <div className="form-actions"><button className="quiet-button" onClick={() => setReview(false)}>Edit profile</button><button className="metal-button" disabled>Deployment unavailable</button></div>
      </div>}
    </div>
    <aside className="launch-sidebar"><div className="panel"><p className="eyebrow">BUILT IN THE OPEN</p><h3>A clear view of every launch.</h3><p>Start with your token’s identity. Review every detail before it reaches the chain.</p><div className="sidebar-rule" /><p className="subtle">Rebates and buybacks are planned features. No fee or reward mechanism is active in this version.</p></div><button className="quiet-button" onClick={reset}>Clear draft</button></aside>
  </section>;
}
