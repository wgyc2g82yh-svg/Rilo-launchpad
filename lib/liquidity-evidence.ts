export type LiquidityEvidence = {
  status: "locked" | "partial" | "unlocked" | "unknown";
  lockedPercent: number | null;
  pool: string;
  lpMint: string | null;
  creator: string | null;
  developerControl: "unverified";
  detail: string;
  source: "RugCheck";
  observedAt: string;
};
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function liquidityEvidence(report: unknown, mint: string, pool: string, observedAt: string): LiquidityEvidence {
  const raw = object(report);
  const result: LiquidityEvidence = { status: "unknown", lockedPercent: null, pool, lpMint: null, creator: typeof raw.creator === "string" ? raw.creator : null, developerControl: "unverified", detail: "No supported liquidity-lock evidence was returned for this pool.", source: "RugCheck", observedAt };
  if (raw.mint !== mint) return { ...result, creator: null, detail: "The report did not match this token." };
  const market = Array.isArray(raw.markets) ? raw.markets.map(object).find(item => item.pubkey === pool && [item.mintA, item.mintB].includes(mint)) : undefined;
  if (!market) return result;
  const lp = object(market.lp);
  const lpMint = typeof market.mintLP === "string" ? market.mintLP : null;
  result.lpMint = lpMint;
  // Position-based pools often return zero-valued placeholder LP fields. Zero
  // coverage must never be converted into an "unlocked" verdict.
  if (!lpMint || lpMint === "11111111111111111111111111111111" || !finite(lp.lpLocked) || !finite(lp.lpUnlocked) || lp.lpLocked < 0 || lp.lpUnlocked < 0 || lp.lpLocked + lp.lpUnlocked <= 0) return { ...result, detail: "LP-token lock coverage is unavailable. Position-based liquidity requires separate position and locker verification." };
  const pct = lp.lpLockedPct;
  if (!finite(pct) || pct < 0 || pct > 100) return result;
  const calculated = lp.lpLocked / (lp.lpLocked + lp.lpUnlocked) * 100;
  if (Math.abs(calculated - pct) > 0.1) return { ...result, detail: "The provider returned inconsistent LP lock readings." };
  const status = lp.lpUnlocked === 0 && pct === 100 ? "locked" : lp.lpLocked === 0 && pct === 0 ? "unlocked" : "partial";
  return { ...result, status, lockedPercent: pct, detail: status === "locked" ? "The provider reports all tracked LP tokens locked or burned. Lock duration and locker contracts have not been independently verified." : status === "unlocked" ? "The provider reports tracked LP tokens as unlocked. This does not identify who controls them." : "The provider reports a mix of locked/burned and unlocked LP tokens. This does not identify who controls the unlocked portion." };
}
