import test from 'node:test';
import assert from 'node:assert/strict';
import { PUMP_PROGRAM, pumpInitialReserves, pumpCurveProgress } from '../lib/pump-curve-state.ts';
const initial=793100000000000n,supply=1000000000000000n;
const account=data=>({owner:PUMP_PROGRAM,data:[data.toString('base64'),'base64']});
const config={initial,supply};
function curve(remaining=initial/10n){const data=Buffer.alloc(160);Buffer.from([23,183,248,55,96,216,172,96]).copy(data);data.writeBigUInt64LE(remaining,24);data.writeBigUInt64LE(supply,40);return data;}
test('reads live initial reserves only from a valid Pump Global account',()=>{
 const data=Buffer.alloc(105);Buffer.from([167,232,232,177,200,108,114,127]).copy(data);data.writeBigUInt64LE(initial,89);data.writeBigUInt64LE(supply,97);
 assert.deepEqual(pumpInitialReserves(account(data)),config);
 assert.equal(pumpInitialReserves({...account(data),owner:'other'}),null);
 data.writeBigUInt64LE(0n,89);assert.equal(pumpInitialReserves(account(data)),null);
});
test('graduation uses verified remaining tokens and excludes completed/unsupported curves',()=>{
 assert.equal(pumpCurveProgress(account(curve()),config),90);
 assert.equal(pumpCurveProgress(account(curve(initial)),config),0);
 assert.equal(pumpCurveProgress(account(curve(initial/5n)),config),80);
 for(const change of [data=>data[48]=1,data=>data[81]=1,data=>data[83]=1,data=>data[141]=1,data=>data[0]=0,data=>data.writeBigUInt64LE(1n,40)]){
  const data=curve();change(data);assert.equal(pumpCurveProgress(account(data),config),null);
 }
 for(const remaining of [0n,initial+1n])assert.equal(pumpCurveProgress(account(curve(remaining)),config),null);
 assert.equal(pumpCurveProgress({...account(curve()),owner:'other'},config),null);
 assert.equal(pumpCurveProgress(null,config),null);
 assert.equal(pumpCurveProgress(account(Buffer.alloc(20)),config),null);
});
