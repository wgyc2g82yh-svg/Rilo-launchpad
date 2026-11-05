import { ActivationType, BaseFeeMode, CollectFeeMode, DammV2DynamicFeeMode, MigratedCollectFeeMode, MigrationFeeOption, MigrationOption, TokenAuthorityOption, TokenType, buildCurveWithMarketCap } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { LAUNCH_FEE_SOL } from "./integration-types.ts";

// SDK curve builders accept SOL; the resulting on-chain config stores lamports.
export function buildLaunchCurve({ supply, initialMarketCap, migrationMarketCap, feeBps }: { supply: number; initialMarketCap: number; migrationMarketCap: number; feeBps: number }) {
  return buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: 6, tokenQuoteDecimal: 9, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: supply, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerLinear, feeSchedulerParam: { startingFeeBps: feeBps, endingFeeBps: feeBps, numberOfPeriod: 0, totalDuration: 0 } }, dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 1, poolCreationFee: LAUNCH_FEE_SOL, enableFirstSwapWithMinFee: true },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.Customizable, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 }, migratedPoolFee: { collectFeeMode: MigratedCollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Disabled, poolFeeBps: feeBps } },
    liquidityDistribution: { partnerLiquidityPercentage: 0, creatorLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 99, creatorPermanentLockedLiquidityPercentage: 1 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 }, activationType: ActivationType.Timestamp, initialMarketCap, migrationMarketCap,
  });
}
