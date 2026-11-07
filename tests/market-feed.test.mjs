import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalization, mergeFeed, applyQuotes, positiveNumber, quoteBatch, liveQuoteBatches, mergeMarket } from '../lib/market-feed-data.ts';
const market=(mint,pool=mint,extra={})=>({mint,pool,...extra});
test('pagination retains more than twenty tokens and deduplicates moving page boundaries',()=>{
 const first=Array.from({length:20},(_,i)=>market(String(i)));
 const second=Array.from({length:20},(_,i)=>market(String(i+18)));
 const all=mergeFeed(first,second);
 assert.equal(all.length,38);
 const updated=mergeFeed(all,[market('new'),market('0','updated')],true);
 assert.equal(updated.length,39);assert.equal(updated[0].mint,'new');assert.equal(updated.find(m=>m.mint==='0').pool,'updated');
});
test('capitalization distinguishes reported cap, estimated FDV, and unavailable data',()=>{
 assert.deepEqual(capitalization('123','900'),{marketCap:123,marketCapKind:'reported'});
 assert.deepEqual(capitalization(null,'900'),{marketCap:900,marketCapKind:'fdv'});
 assert.deepEqual(capitalization(0,0),{marketCap:null,marketCapKind:null});
 for(const value of [null,true,{},-1,Infinity,'NaN',''])assert.equal(positiveNumber(value),null);
});
test('quotes update loaded rows without borrowing volume from another pool or downgrading reported caps',()=>{
 const rows=[market('a','curve',{marketCap:100,marketCapKind:'fdv',volume24h:10}),market('b','b',{marketCap:200,marketCapKind:'reported'})];
 const result=applyQuotes(rows,[market('a','other',{marketCap:150,marketCapKind:'reported',volume24h:999}),market('b','b',{marketCap:300,marketCapKind:'fdv'}),market('wrong','curve',{marketCap:99999,marketCapKind:'reported'})]);
 assert.equal(result[0].marketCap,150);assert.equal(result[0].volume24h,10);assert.equal(result[1].marketCap,200);
 assert.deepEqual(applyQuotes(rows,[]),rows);
});
test('feed refresh retains the last capitalization during provider gaps and accepts fresh reported caps',()=>{
 const previous=[market('a','curve',{marketCap:100,marketCapKind:'reported'})];
 for(const extra of [{marketCap:null,marketCapKind:null},{marketCap:200,marketCapKind:'fdv'}]) {
  const refreshed=mergeFeed(previous,[market('a','destination',extra)],true);
  assert.equal(refreshed[0].marketCap,100);assert.equal(refreshed[0].marketCapKind,'reported');assert.equal(refreshed[0].pool,'destination');
 }
 assert.equal(mergeFeed(previous,[market('a','curve',{marketCap:150,marketCapKind:'reported'})])[0].marketCap,150);
});
test('quote refresh rotates bounded batches so large feeds do not refetch every token each cycle',()=>{
 const rows=Array.from({length:400},(_,i)=>market(String(i))),visited=[];let offset=0;
 for(let i=0;i<5;i++){const batch=quoteBatch(rows,offset);assert.ok(batch.mints.length<=90);visited.push(...batch.mints);offset=batch.nextOffset;}
 assert.equal(visited.length,400);assert.equal(new Set(visited).size,400);assert.equal(offset,0);
 assert.deepEqual(quoteBatch([],0),{mints:[],nextOffset:0});assert.equal(quoteBatch(rows,9999).mints[0],'0');
});
test('image metadata survives provider gaps and quote images fill missing icons for the same mint',()=>{
 const rows=[market('a','curve',{imageUrl:'https://images.test/a.png'}),market('b','b',{imageUrl:null})];
 const refreshed=mergeFeed(rows,[market('a','curve',{imageUrl:null})]);
 assert.equal(refreshed[0].imageUrl,rows[0].imageUrl);
 const result=applyQuotes(refreshed,[market('a','other',{imageUrl:'https://images.test/alternate.png'}),market('b','other',{imageUrl:'https://images.test/b.png'}),market('wrong','b',{imageUrl:'https://images.test/wrong.png'})]);
 assert.equal(result[0].imageUrl,rows[0].imageUrl);
 assert.equal(result[0].fallbackImageUrl,'https://images.test/alternate.png');
 assert.equal(result[1].imageUrl,'https://images.test/b.png');
 assert.equal(applyQuotes(result,[market('b','b',{imageUrl:null})])[1].imageUrl,'https://images.test/b.png');
});

test('every loaded mint is included in the fast quote pass, with bounded requests',()=>{
 const rows=Array.from({length:400},(_,i)=>market(String(i)));
 const batches=liveQuoteBatches([...rows,rows[0]]);
 assert.equal(batches.length,5);assert.ok(batches.every(batch=>batch.length<=90));
 assert.deepEqual(batches.flat(),rows.map(row=>row.mint));
 assert.deepEqual(liveQuoteBatches([]),[]);
});
test('slower discovery and older quotes cannot roll back a newer market cap or pool metrics',()=>{
 const current=market('a','pool',{quotedAt:'2026-11-07T08:00:10Z',marketCap:150,marketCapKind:'reported',price:1.5,volume24h:100});
 const old=market('a','pool',{quotedAt:'2026-11-07T08:00:05Z',marketCap:100,marketCapKind:'reported',price:1,volume24h:50});
 assert.equal(applyQuotes([current],[old])[0].marketCap,150);
 assert.equal(applyQuotes([current],[old])[0].price,1.5);
 assert.equal(mergeFeed([current],[old])[0].marketCap,150);
 const {quotedAt,...undated}=old;
 assert.equal(mergeFeed([current],[undated])[0].marketCap,150);
 assert.equal(mergeMarket(current,undated).price,1.5);
 const migrated=mergeMarket(current,{...undated,pool:'destination',volume24h:8});
 assert.equal(migrated.pool,'destination');assert.equal(migrated.volume24h,8);
});
test('fresh quotes update up and down, prefer the selected pool, and label a fresh FDV estimate',()=>{
 const current=market('a','pool',{quotedAt:'2026-11-07T08:00:10Z',marketCap:150,marketCapKind:'reported',price:1.5});
 const next=market('a','pool',{quotedAt:'2026-11-07T08:00:15Z',marketCap:175.25,marketCapKind:'fdv',price:1.75});
 const other=market('a','other',{...next, pool:'other',marketCap:999,marketCapKind:'reported'});
 const rise=applyQuotes([current],[other,next])[0];
 assert.equal(rise.marketCap,175.25);assert.equal(rise.marketCapKind,'fdv');assert.equal(rise.price,1.75);
 const fall=applyQuotes([rise],[{...next,quotedAt:'2026-11-07T08:00:20Z',marketCap:160.75,price:1.6}])[0];
 assert.equal(fall.marketCap,160.75);assert.equal(fall.price,1.6);
 assert.equal(mergeMarket(current,next).marketCap,175.25);
});
