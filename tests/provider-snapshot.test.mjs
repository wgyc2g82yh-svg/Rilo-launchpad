import test from 'node:test';
import assert from 'node:assert/strict';
import { readProviderSnapshot } from '../lib/provider-snapshot.ts';
test('normal shared revalidation does not start a second provider request',async()=>{
 let requests=0;
 const snapshot={value:['candidate'],receivedAt:1000};
 const result=await readProviderSnapshot(async()=>snapshot,async()=>{requests++;return {value:[],receivedAt:30000}},()=>30000);
 assert.equal(requests,0);assert.equal(result,snapshot);assert.equal(result.receivedAt,1000,'a cache hit retains the actual receipt time');
});
test('an expired shared index recovers in the request, rather than remaining stuck forever',async()=>{
 let requests=0;
 const fresh={value:['new candidate'],receivedAt:62000};
 const result=await readProviderSnapshot(async()=>({value:[],receivedAt:1000}),async()=>{requests++;return fresh},()=>62000);
 assert.equal(requests,1);assert.equal(result,fresh);
 const busy=Object.assign(new Error('provider busy'),{status:429});
 await assert.rejects(readProviderSnapshot(async()=>({value:[],receivedAt:0}),async()=>{throw busy},()=>300001),error=>error===busy,'real provider errors remain visible to bounded stale-snapshot handling');
});
