import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleDiscovery, rankDiscovery, reconcileDiscoveryPages, discoveryPageMarkets, discoverySnapshot } from '../lib/discovery-policy.ts';
const now=Date.parse('2026-11-07T08:10:00Z');
const market=(mint,extra={})=>({mint,pool:mint,symbol:'SAME',dex:'pump-fun',launchStage:'bonding',graduationProgress:10,createdAt:new Date(now-60000).toISOString(),...extra});
const response=(page,markets,seconds,extra={})=>({page,markets,observedAt:new Date(now+seconds*1000).toISOString(),source:'fixture',...extra});
test('new launches require a recent original curve, low progress, valid age and explicit launch status',()=>{
 assert.equal(eligibleDiscovery(market('new'),'new',now),true);
 for(const extra of [{createdAt:null},{createdAt:new Date(now-31*60000).toISOString()},{createdAt:new Date(now+1000).toISOString()},{launchStage:null},{launchStage:'graduated'},{graduationProgress:80},{graduationProgress:NaN},{dex:'pumpswap'},{dex:'meteora-dlmm'}])assert.equal(eligibleDiscovery(market('old',extra),'new',now),false,JSON.stringify(extra));
 assert.deepEqual(rankDiscovery([market('a'),market('b',{createdAt:new Date(now-10000).toISOString()}),market('a')],'new',now).map(m=>m.mint),['b','a']);
});
test('bonding is 80 to under 100 percent, ranked closest first; graduation is a separate stage',()=>{
 const rows=[market('low',{graduationProgress:79.99}),market('80',{graduationProgress:80}),market('99',{graduationProgress:99}),market('done',{launchStage:'graduated',graduationProgress:100}),market('unknown',{graduationProgress:null})];
 assert.deepEqual(rankDiscovery(rows,'bonding',now).map(m=>m.mint),['99','80']);
 assert.deepEqual(rankDiscovery(rows,'graduated',now).map(m=>m.mint),['done']);
});
test('refresh replaces vanished entries and retains only the current loaded pages, without deduplicating tickers',()=>{
 let pages=reconcileDiscoveryPages(new Map(),response(1,[market('old'),market('still')],0));
 pages=reconcileDiscoveryPages(pages,response(2,[market('older')],0));
 pages=reconcileDiscoveryPages(pages,response(1,[market('new'),market('still')],20));
 assert.deepEqual(new Set(discoveryPageMarkets(pages,'new',now).map(m=>m.mint)),new Set(['new','still','older']));
 assert.ok(!discoveryPageMarkets(pages,'new',now).some(m=>m.mint==='old'));
 assert.equal(discoveryPageMarkets(pages,'new',now+31*60000).length,0);
});
test('stage exclusions remove old entries across pages; old snapshots cannot resurrect or remove newer evidence',()=>{
 let pages=reconcileDiscoveryPages(new Map(),response(1,[market('moving')],20));
 pages=reconcileDiscoveryPages(pages,response(2,[],0,{excludedMints:['moving']}));
 assert.equal(discoveryPageMarkets(pages,'new',now).length,1);
 pages=reconcileDiscoveryPages(pages,response(1,[],10));
 assert.equal(discoveryPageMarkets(pages,'new',now).length,1);
 pages=reconcileDiscoveryPages(pages,response(2,[],30,{excludedMints:['moving']}));
 assert.equal(discoveryPageMarkets(pages,'new',now).length,0);
 pages=reconcileDiscoveryPages(pages,response(3,[market('moving')],25));
 assert.equal(discoveryPageMarkets(pages,'new',now).length,0,'an older new page cannot resurrect a token excluded by newer stage evidence');
});
test('graduated view sorts actual completion timestamps before pool creation timestamps',()=>{
 const rows=[market('old',{launchStage:'graduated',graduatedAt:'2026-11-07T08:00:00Z'}),market('latest',{launchStage:'graduated',graduatedAt:'2026-11-07T08:09:00Z'})];
 assert.deepEqual(rankDiscovery(rows,'graduated',now).map(m=>m.mint),['latest','old']);
});

test('older pagination cannot mark a healthy newest page delayed or replace its observation time',()=>{
 const head=response(1,[market('latest',{launchStage:'graduated'})],40,{source:'head provider',stale:false,partial:false,refreshMs:20000});
 const older=response(2,[market('older',{launchStage:'graduated'})],0,{source:'old provider',stale:true,partial:true,coverageNote:'old page unavailable',refreshMs:60000});
 let pages=new Map([[1,head],[2,older]]);
 const combined=discoverySnapshot(pages,'graduated');
 assert.equal(combined.observedAt,head.observedAt);assert.equal(combined.source,'head provider');
 assert.equal(combined.stale,false);assert.equal(combined.partial,false);assert.equal(combined.coverageNote,undefined);assert.equal(combined.refreshMs,20000);
 assert.equal(combined.markets.length,2,'keep older rows without making their health the status of the newest feed');
 pages.set(1,{...head,stale:true});assert.equal(discoverySnapshot(pages,'graduated').stale,true,'a genuinely stale head remains visible');
 assert.equal(discoverySnapshot(new Map([[2,older]]),'new'),null,'an older page alone cannot masquerade as the newest response');
});
