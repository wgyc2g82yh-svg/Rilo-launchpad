import "server-only";
import { IntegrationError } from "@/lib/integration-server";
import { isSolanaAddress } from "@/lib/token-analysis";
import { rugcheckReport } from "@/lib/rugcheck-service";
import { liquidityEvidence } from "@/lib/liquidity-evidence";
export async function tokenLiquidity(mint: string, pool: string) {
  if (!isSolanaAddress(mint) || !isSolanaAddress(pool)) throw new IntegrationError(400, "Choose a valid token and pool for liquidity checks.");
  const report = await rugcheckReport(mint);
  return liquidityEvidence(report.report, mint, pool, report.observedAt);
}
