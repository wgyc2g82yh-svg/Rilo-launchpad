import "server-only";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { ActivationType, BaseFeeMode, CollectFeeMode, DammV2DynamicFeeMode, DynamicBondingCurveClient, MigratedCollectFeeMode, MigrationFeeOption, MigrationOption, TokenAuthorityOption, TokenType, buildCurveWithMarketCap, deriveDbcPoolAddress, getCurrentPoint } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { address, buildTransaction, chainConnection } from "@/lib/chain-transactions";
import { cached, IntegrationError, transactionNetwork } from "@/lib/integration-server";
import { SOL_MINT } from "@/lib/integration-types";
import type { PoolDetails } from "@/lib/integration-types";

export const dbc = () => new DynamicBondingCurveClient(chainConnection(), "confirmed");
export async function getLaunchConfig() {
  const key = process.env.RILO_DBC_CONFIG;
  if (!key) throw new IntegrationError(503, "The RILO bonding curve has not been configured yet.");
  return cached(`dbc-config:${key}`, 30_000, async () => {
    const config = await dbc().state.getPoolConfig(address(key));
    if (!config) throw new IntegrationError(503, "The launch configuration does not exist on this network.");
    if (config.quoteMint.toBase58() !== SOL_MINT || config.creatorTradingFeePercentage !== 1 || config.tokenUpdateAuthority !== TokenAuthorityOption.Immutable || config.tokenType !== TokenType.SPLToken || config.migrationOption !== MigrationOption.MET_DAMM_V2 || config.collectFeeMode !== CollectFeeMode.QuoteToken || config.creatorLiquidityPercentage !== 0 || config.partnerLiquidityPercentage !== 0 || config.creatorPermanentLockedLiquidityPercentage !== 1 || config.partnerPermanentLockedLiquidityPercentage !== 99) throw new IntegrationError(503, "This launch configuration does not match RILO’s published fee and liquidity policy.");
    if (!process.env.RILO_TREASURY_ADDRESS || config.feeClaimer.toBase58() !== process.env.RILO_TREASURY_ADDRESS) throw new IntegrationError(503, "The platform fee receiver does not match the launch configuration.");
    if (!config.fixedTokenSupplyFlag || !config.preMigrationTokenSupply.eq(config.postMigrationTokenSupply) || !config.lockedVestingConfig.amountPerPeriod.isZero() || !config.lockedVestingConfig.cliffUnlockAmount.isZero() || config.creatorLiquidityVestingInfo.vestingPercentage || config.partnerLiquidityVestingInfo.vestingPercentage || config.migrationFeePercentage || config.creatorMigrationFeePercentage || config.transferFeeFlag) throw new IntegrationError(503, "This configuration includes token allocations or fee options outside RILO’s fair-launch policy.");
    return { key, config };
  });
}
export async function curveSummary() {
  const { key, config } = await getLaunchConfig();
  return { config: key, creatorFeePercent: config.creatorTradingFeePercentage, creationFeeLamports: config.poolCreationFee.toString(), graduationLamports: config.migrationQuoteThreshold.toString(), decimals: config.tokenDecimal, supplyRaw: config.preMigrationTokenSupply.toString(), permanentlyLockedLiquidityPercent: config.creatorPermanentLockedLiquidityPercentage + config.partnerPermanentLockedLiquidityPercentage, metadataImmutable: true };
}
export async function createLaunch(wallet: string, mint: string, name: string, symbol: string, uri: string) {
  await transactionNetwork();
  const { key } = await getLaunchConfig();
  const pool = deriveDbcPoolAddress(new PublicKey(SOL_MINT), new PublicKey(mint), new PublicKey(key)).toBase58();
  const transaction = await dbc().creator.createPool({ config: new PublicKey(key), baseMint: new PublicKey(mint), poolCreator: new PublicKey(wallet), payer: new PublicKey(wallet), name, symbol, uri });
  return buildTransaction(transaction, wallet, "launch", { mint, pool, summary: `Launch ${symbol} on RILO’s fair-launch curve. Creator receives 1% of distributable trading fees. Liquidity positions remain permanently locked at graduation.` });
}
export async function poolForMint(mint: string): Promise<PoolDetails | null> {
  return cached(`dbc-pool:${mint}`, 25_000, async () => {
    const client = dbc();
    const found = await client.state.getPoolByBaseMint(address(mint)); if (!found) return null;
    const state = found.account.poolState;
    const [config, metrics, progress, history] = await Promise.all([
      client.state.getPoolConfig(state.config), client.state.getPoolFeeMetrics(found.publicKey), client.state.getPoolQuoteTokenCurveProgress(found.publicKey), client.state.getPoolsByCreator(state.creator).catch(() => null),
    ]);
    if (!config) throw new IntegrationError(502, "The pool configuration could not be read.");
    return { address: found.publicKey.toBase58(), mint, creator: state.creator.toBase58(), config: state.config.toBase58(), graduated: Boolean(state.isMigrated), progress: Math.min(1, Math.max(0, progress)), creatorFeePercent: config.creatorTradingFeePercentage, partnerFees: metrics.current.partnerQuoteFee.toString(), creatorFees: metrics.current.creatorQuoteFee.toString(), quoteMint: config.quoteMint.toBase58(), isRilo: state.config.toBase58() === process.env.RILO_DBC_CONFIG, historyAvailable: history !== null, history: (history ?? []).slice(0, 30).map(pool => ({ pool: pool.publicKey.toBase58(), mint: pool.account.poolState.baseMint.toBase58(), graduated: Boolean(pool.account.poolState.isMigrated) })) };
  });
}
export async function claimPoolFees(wallet: string, poolAddress: string, role: string) {
  await transactionNetwork();
  const client = dbc(); const pool = await client.state.getPool(address(poolAddress));
  if (!pool) throw new IntegrationError(404, "Pool not found.");
  const config = await client.state.getPoolConfig(pool.poolState.config);
  if (!config || pool.poolState.config.toBase58() !== process.env.RILO_DBC_CONFIG) throw new IntegrationError(422, "This pool is not part of the configured RILO launchpad.");
  const payer = new PublicKey(wallet);
  const metrics = await client.state.getPoolFeeMetrics(poolAddress);
  let transaction;
  if (role === "creator") {
    if (pool.poolState.creator.toBase58() !== wallet) throw new IntegrationError(403, "Connect the creator wallet to claim its fees.");
    if (metrics.current.creatorQuoteFee.isZero() && metrics.current.creatorBaseFee.isZero()) throw new IntegrationError(422, "There are no creator fees to claim.");
    transaction = await client.creator.claimCreatorTradingFee({ creator: payer, payer, pool: new PublicKey(poolAddress), maxBaseAmount: metrics.current.creatorBaseFee, maxQuoteAmount: metrics.current.creatorQuoteFee, receiver: payer });
  } else if (role === "partner") {
    if (config.feeClaimer.toBase58() !== wallet || wallet !== process.env.RILO_TREASURY_ADDRESS) throw new IntegrationError(403, "Connect the platform treasury wallet to claim platform fees.");
    if (metrics.current.partnerQuoteFee.isZero() && metrics.current.partnerBaseFee.isZero()) throw new IntegrationError(422, "There are no platform fees to claim.");
    transaction = await client.partner.claimPartnerTradingFee({ feeClaimer: payer, payer, pool: new PublicKey(poolAddress), maxBaseAmount: metrics.current.partnerBaseFee, maxQuoteAmount: metrics.current.partnerQuoteFee, receiver: payer });
  } else throw new IntegrationError(400, "Invalid fee role.");
  return buildTransaction(transaction, wallet, `claim-${role}`, { pool: poolAddress, summary: `Claim accrued ${role === "creator" ? "creator rebate" : "platform"} fees to ${wallet}. Network fees apply.` });
}
export async function createCurveConfig(body: Record<string, unknown>) {
  const wallet = address(body.wallet), configAddress = address(body.config);
  if (wallet !== process.env.RILO_TREASURY_ADDRESS) throw new IntegrationError(403, "Only the configured treasury wallet can initialize RILO’s curve.");
  const supply = Number(body.supply), initialMarketCap = Number(body.initialMarketCap), migrationMarketCap = Number(body.migrationMarketCap), feeBps = Number(body.feeBps);
  if (!Number.isSafeInteger(supply) || supply < 1 || supply > 1e12 || !Number.isFinite(initialMarketCap) || initialMarketCap <= 0 || !Number.isFinite(migrationMarketCap) || migrationMarketCap <= initialMarketCap || migrationMarketCap > 1e9 || !Number.isInteger(feeBps) || feeBps < 25 || feeBps > 1000) throw new IntegrationError(400, "Enter a valid supply, market-cap thresholds in SOL, and fee from 25 to 1000 basis points.");
  const curve = buildCurveWithMarketCap({
    token: { tokenType: TokenType.SPLToken, tokenBaseDecimal: 6, tokenQuoteDecimal: 9, tokenAuthorityOption: TokenAuthorityOption.Immutable, totalTokenSupply: supply, leftover: 0 },
    fee: { baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerLinear, feeSchedulerParam: { startingFeeBps: feeBps, endingFeeBps: feeBps, numberOfPeriod: 0, totalDuration: 0 } }, dynamicFeeEnabled: false, collectFeeMode: CollectFeeMode.QuoteToken, creatorTradingFeePercentage: 1, poolCreationFee: 0, enableFirstSwapWithMinFee: true },
    migration: { migrationOption: MigrationOption.MET_DAMM_V2, migrationFeeOption: MigrationFeeOption.Customizable, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 }, migratedPoolFee: { collectFeeMode: MigratedCollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Disabled, poolFeeBps: feeBps } },
    liquidityDistribution: { partnerLiquidityPercentage: 0, creatorLiquidityPercentage: 0, partnerPermanentLockedLiquidityPercentage: 99, creatorPermanentLockedLiquidityPercentage: 1 },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 }, activationType: ActivationType.Timestamp, initialMarketCap, migrationMarketCap,
  });
  const payer = new PublicKey(wallet);
  const transaction = await dbc().partner.createConfig2({ ...curve, config: new PublicKey(configAddress), feeClaimer: payer, leftoverReceiver: payer, quoteMint: new PublicKey(SOL_MINT), payer, transferFeeParameters: null });
  return buildTransaction(transaction, wallet, "create-config", { config: configAddress, summary: `Initialize fixed-supply ${supply.toLocaleString()} token curve: ${initialMarketCap} → ${migrationMarketCap} SOL market cap; ${feeBps / 100}% trading fee; creator gets 1% of distributable fees; 100% LP positions permanently locked on graduation. Review rent and protocol costs in your wallet.` });
}

export async function curveSwap(input: Record<string, unknown>) {
  const mint = address(input.mint), amount = String(input.amount ?? ""), side = input.side;
  const slippageBps = Number(input.slippageBps ?? 100);
  if (!["buy", "sell"].includes(String(side)) || !/^\d{1,20}$/.test(amount) || BigInt(amount) <= BigInt(0) || BigInt(amount) > BigInt("18446744073709551615") || !Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new IntegrationError(400, "Invalid curve swap amount or slippage.");
  const client = dbc(), found = await client.state.getPoolByBaseMint(mint);
  if (!found || found.account.poolState.isMigrated) throw new IntegrationError(422, "No active bonding curve was found. Use the DEX route after graduation.");
  const config = await client.state.getPoolConfig(found.account.poolState.config);
  if (!config || config.tokenType !== TokenType.SPLToken || config.quoteMint.toBase58() !== SOL_MINT) throw new IntegrationError(422, "This curve uses a token type or quote token outside this integration’s coverage.");
  const currentPoint = await getCurrentPoint(chainConnection(), config.activationType);
  const quote = client.pool.swapQuote({ virtualPool: found.account, config, swapBaseForQuote: side === "sell", amountIn: new BN(amount), slippageBps, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint });
  const result = { router: "Meteora DBC", inAmount: amount, outAmount: quote.excludedTransferFeeAmountOut.toString(), otherAmountThreshold: quote.minimumAmountOut.toString(), inputMint: side === "buy" ? SOL_MINT : mint, outputMint: side === "buy" ? mint : SOL_MINT, inputDecimals: side === "buy" ? 9 : config.tokenDecimal, outputDecimals: side === "buy" ? config.tokenDecimal : 9, slippageBps, feeBps: null as number | null, pool: found.publicKey.toBase58() };
  if (!input.wallet) return { ...result, built: null };
  const wallet = address(input.wallet);
  const transaction = await client.pool.swap({ owner: new PublicKey(wallet), pool: found.publicKey, amountIn: new BN(amount), minimumAmountOut: quote.minimumAmountOut, swapBaseForQuote: side === "sell", referralTokenAccount: null });
  const built = await buildTransaction(transaction, wallet, "dbc-swap", { pool: found.publicKey.toBase58(), mint, summary: `${side === "buy" ? "Buy" : "Sell"} on the Meteora bonding curve. Minimum output: ${quote.minimumAmountOut.toString()} token units. Slippage: ${slippageBps / 100}%.` });
  return { ...result, built };
}
