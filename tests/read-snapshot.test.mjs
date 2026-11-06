import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadSnapshots } from '../lib/read-snapshot.ts';
const busy=(status=429,retryAfterMs=60000)=>Object.assign(new Error('busy'),{status,retryAfterMs});
test('public snapshots coalesce concurrent reads and reuse fresh display data',async()=>{
 let calls=0,finish;const cache=createReadSnapshots(()=>1000);
 const load=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const first=cache.read('feed',20,load),second=cache.read('feed',20,load);
 assert.equal(calls,1);finish({observedAt:'original',markets:['a']});
 assert.deepEqual(await first,await second);await cache.read('feed',20,load);assert.equal(calls,1);
});
test('throttled refresh preserves the original snapshot and honors backoff without resetting its age',async()=>{
 let now=0,calls=0;const cache=createReadSnapshots(()=>now,300000);
 await cache.read('feed',20,async()=>({observedAt:'original',markets:['a']}));now=21;
 const fail=async()=>{calls++;throw busy(429,120000);};
 const stale=await cache.read('feed',20,fail);assert.equal(stale.stale,true);assert.equal(stale.value.observedAt,'original');
 now=100000;await cache.read('feed',20,fail);assert.equal(calls,1,'do not hammer a throttled provider');
 now=300001;await assert.rejects(cache.read('feed',20,fail));assert.equal(calls,2,'a snapshot older than the hard limit is never returned');
});
test('cold throttles are cached briefly without inventing results, and recovery refreshes normally',async()=>{
 let now=0,calls=0;const cache=createReadSnapshots(()=>now);
 const fail=async()=>{calls++;throw busy();};
 await assert.rejects(cache.read('new',20,fail));await assert.rejects(cache.read('new',20,fail));assert.equal(calls,1);
 now=60001;const recovered=await cache.read('new',20,async()=>({markets:['verified']}));assert.equal(recovered.stale,false);assert.deepEqual(recovered.value.markets,['verified']);
});
test('validation or authorization failures never fall back to old display data',async()=>{
 let now=0;const cache=createReadSnapshots(()=>now);
 await cache.read('feed',20,async()=>({markets:['old']}));now=21;
 for(const status of [400,401,403,404])await assert.rejects(cache.read('feed',20,async()=>{throw busy(status);}),error=>error.status===status);
});
