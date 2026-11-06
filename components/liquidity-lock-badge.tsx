import type { LiquidityEvidence } from "@/lib/liquidity-evidence";

export function LiquidityLockBadge({ evidence, checked }: { evidence: LiquidityEvidence | null; checked: boolean }) {
  const status = checked ? evidence?.status ?? "unknown" : "checking";
  const labels = { locked: "Locked", unlocked: "Unlocked", partial: "Partial", unknown: "Unknown", checking: "Checking" };
  const detail = evidence ? `${evidence.detail} Source: ${evidence.source}. Checked ${new Date(evidence.observedAt).toLocaleTimeString()}.` : checked ? "Liquidity lock evidence is unavailable for this pool. Unknown is not an unlocked verdict." : "Checking liquidity-lock evidence for this pool.";
  return <span className={`liquidity-metric-lock liquidity-lock-${status}`} role="status" aria-label={`Liquidity lock: ${labels[status]}${evidence ? ' (provider reported)' : ''}`} title={detail}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {status === "unknown" || status === "checking" ? <><circle cx="12" cy="12" r="9" />{status === "checking" ? <path d="M12 6v6l4 2" /> : <path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1" />}</> : <><rect x="5" y="10" width="14" height="11" rx="2" />{status === "unlocked" ? <path d="M8 10V7a4 4 0 0 1 7-2" /> : <path d="M8 10V7a4 4 0 0 1 8 0v3" />}{status === "partial" ? <path d="M12 13v5" strokeWidth="4" /> : <path d="M12 14v3" />}</>}
    </svg>{labels[status]}
  </span>;
}
