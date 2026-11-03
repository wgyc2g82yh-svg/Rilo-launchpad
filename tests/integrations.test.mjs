import test from 'node:test';
import assert from 'node:assert/strict';
import { fromUnits, toUnits, normalizeCandles, MAINNET_GENESIS } from '../lib/integration-types.ts';
import { PublicKey } from '@solana/web3.js';
import integerBuffer from '../vendor/bigint-buffer/index.cjs';
import { buildLaunchCurve } from '../lib/launch-policy.ts';
import { LAUNCH_FEE_LAMPORTS } from '../lib/integration-types.ts';
import { TokenAuthorityOption, PROTOCOL_POOL_CREATION_FEE_PERCENT } from '@meteora-ag/dynamic-bonding-curve-sdk';

test('amount entry is exact above floating point precision and rejects ambiguous values', () => {
  assert.equal(toUnits('9007199254.740993',6),'9007199254740993');
  assert.equal(fromUnits('9007199254740993',6),'9007199254.740993');
  assert.equal(fromUnits('1000000000',9),'1');
  for(const value of ['0','-1','1e9','1,000','NaN','.1','0.0000000001']) assert.throws(()=>toUnits(value,9));
  assert.throws(()=>toUnits('18446744073709551616',0));
});
test('charts only contain valid, ordered, real candles and preserve volume',()=>{
  const candles=normalizeCandles([[120,2,3,1,2.5,20],[60,1,2,1,2,10],[120,2,4,1,3,30],[180,4,1,3,4,10],[240,1,2,1,NaN,5]]);
  assert.deepEqual(candles.map(c=>c.time),[60,120]); assert.equal(candles[1].volume,30); assert.equal(candles[1].close,3);
});
test('network gate uses the full 32-byte genesis hash, rather than a shortened chain reference',()=>{
  assert.equal(new PublicKey(MAINNET_GENESIS).toBytes().length,32);
  assert.equal(MAINNET_GENESIS,'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
});
test('native-free integer adapter checks widths and round-trips Solana integers',()=>{
  for(const width of [1,8,16,24,32]){
    const maximum=(1n<<BigInt(width*8))-1n;
    for(const value of [0n,1n,maximum]){
      assert.equal(integerBuffer.toBigIntLE(integerBuffer.toBufferLE(value,width)),value);
      assert.equal(integerBuffer.toBigIntBE(integerBuffer.toBufferBE(value,width)),value);
    }
    assert.throws(()=>integerBuffer.toBufferLE(maximum+1n,width));
  }
  assert.equal(integerBuffer.toBigIntLE(new Uint8Array()),0n);
  assert.throws(()=>integerBuffer.toBufferBE(-1n,8));
  assert.throws(()=>integerBuffer.toBufferBE(1n,-1));
});
test('SDK builds the chosen fee-share and locked-liquidity policy without premine or transfer tax',()=>{
  const curve=buildLaunchCurve({supply:1_000_000_000,initialMarketCap:100,migrationMarketCap:3000,feeBps:100});
  assert.equal(curve.poolCreationFee.toString(), LAUNCH_FEE_LAMPORTS);
  assert.equal(curve.poolCreationFee.muln(100-PROTOCOL_POOL_CREATION_FEE_PERCENT).divn(100).toString(),'450000000');
  assert.equal(curve.creatorTradingFeePercentage,1); assert.equal(curve.tokenUpdateAuthority,TokenAuthorityOption.Immutable);
  assert.equal(curve.partnerPermanentLockedLiquidityPercentage+curve.creatorPermanentLockedLiquidityPercentage,100);
  assert.equal(curve.creatorLiquidityPercentage,0); assert.equal(curve.partnerLiquidityPercentage,0);
  assert.ok(curve.migrationQuoteThreshold.gt(curve.poolCreationFee));
});
