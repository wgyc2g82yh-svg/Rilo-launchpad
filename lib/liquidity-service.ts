import "server-only";
import { cached, fetchProvider, IntegrationError } from "@/lib/integration-server";
import { isSolanaAddress } from "@/lib/token-analysis";
import { liquidityEvidence } from "@/lib/liquidity-evidence";
export async function tokenLiquidity(mint: string, pool: string) {
  if (!isSolanaAddress(mint) || !isSolanaAddress(pool)) throw new IntegrationError(400, "Choose a valid token and pool for liquidity checks.");
  const root = (process.env.RUGCHECK_API_URL || "https://api.rugcheck.xyz/v1").replace(/\/$/, "");
  const report = await cached(`rugcheck:${mint}`, 60_000, async () => ({ report: await fetchProvider(`${root}/tokens/${mint}/report`), observedAt: new Date().toISOString() }));
  return liquidityEvidence(report.report, mint, pool, report.observedAt);
}
