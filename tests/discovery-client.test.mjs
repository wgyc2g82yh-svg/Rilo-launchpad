import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryStore } from '../lib/discovery-client.ts';
const mint='So11111111111111111111111111111111111111112';
const value=(time,extra={})=>({page:1,markets:[{mint,pool:mint,symbol:'TEST',name:'Test',imageUrl:null,marketCap:10}],source:'fixture',observedAt:new Date(time).toISOString(),...extra});
test('returning to a tab restores recent real rows from memory or session storage, but expires stale snapshots',()=>{
 let now=100000;const data=new Map(),storage=()=>({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)});
 const first=createDiscoveryStore(async()=>value(now),()=>now,storage);
 first.save('new',value(now));assert.equal(first.read('new').markets.length,1);
 const restored=createDiscoveryStore(async()=>value(now),()=>now,storage);
 assert.equal(restored.read('new').markets[0].mint,mint);
 now+=21000;assert.equal(restored.read('new').stale,false,'restoring a recent tab must not invent a failed refresh');
 now+=40000;assert.equal(restored.read('new'),null);
});
test('a homepage preload and a simultaneous tab request share one in-flight read',async()=>{
 let resolve,calls=0;const pending=new Promise(r=>resolve=r),store=createDiscoveryStore(async()=>{calls++;return pending},()=>100000);
 const a=store.request('new'),b=store.request('new');assert.equal(a,b);assert.equal(calls,1);
 resolve(value(100000));await Promise.all([a,b]);assert.equal(store.read('new').markets.length,1);
});
test('older responses cannot rewind restored rows or replace newer quote values',()=>{
 const store=createDiscoveryStore(async()=>value(100000),()=>100000);
 store.save('new',value(99000,{markets:[{mint,pool:mint,symbol:'TEST',marketCap:20,quotedAt:new Date(100000).toISOString()}]}));
 store.save('new',value(98000));assert.equal(store.read('new').markets[0].marketCap,20);
 store.save('new',value(99000));assert.equal(store.read('new').markets[0].marketCap,20);
});
test('blocked storage and rejected preloads do not poison future attempts',async()=>{
 let fail=true;const store=createDiscoveryStore(async()=>{if(fail)throw new Error('offline');return value(100000)},()=>100000,()=>{throw new Error('storage blocked')});
 assert.equal(store.read('new'),null);await assert.rejects(store.request('new'));
 fail=false;await store.request('new');assert.equal(store.read('new').markets.length,1);
});
