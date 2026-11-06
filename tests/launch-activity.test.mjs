import test from 'node:test';
import assert from 'node:assert/strict';
import { scanLaunchActivity, mintInitialized } from '../lib/launch-activity.ts';
import { securityReport } from '../lib/security-report.ts';
import { providerRisk, developerRiskHistory } from '../lib/provider-risk.ts';
import { analyzeMint, TOKEN_PROGRAM } from '../lib/token-analysis.ts';
const mint='So11111111111111111111111111111111111111112', alice=TOKEN_PROGRAM, bob='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const balance=(wallet,amount)=>({accountIndex:0,mint,owner:wallet,uiTokenAmount:{amount}});
const transaction=(wallet,slot,initialize=false)=>({slot,meta:{err:null,preTokenBalances:[],postTokenBalances:[balance(wallet,'100')]},transaction:{message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:initialize?[{program:'spl-token',parsed:{type:'initializeMint2',info:{mint}}}]:[]}}});
const scan=()=>analyzeMint(mint,TOKEN_PROGRAM,{supply:'1000',decimals:0,isInitialized:true,mintAuthority:null,freezeAuthority:null},null,42);
test('early activity includes signed owners who exited and verifies initialization before labeling launch',async()=>{
 const rows=[{signature:'second',slot:10,err:null},{signature:'first',slot:10,err:null}];
 const activity=await scanLaunchActivity(mint,async(method,params)=>method==='getSignaturesForAddress'?rows:transaction(params[0]==='first'?alice:bob,10,params[0]==='first'));
 assert.equal(activity.window,'launch');assert.equal(activity.initializationSignature,'first');assert.equal(activity.sampledWallets,2);assert.equal(activity.tokenTransactionsRead,2);assert.equal(activity.accumulation.length,1);
 const report=securityReport(scan(),null,null,null,null,null,activity);
 assert.equal(report.checks.find(c=>c.id==='bundles').state,'attention');assert.equal(report.launch.mint,mint);assert.equal(report.checks.find(c=>c.id==='clean').state,'unknown');
});
test('read token transactions without a group show an observed sample, not missing data or a clean launch',async()=>{
 const activity=await scanLaunchActivity(mint,async(method)=>method==='getSignaturesForAddress'?[{signature:'one',slot:10,err:null}]:transaction(alice,10));
 assert.equal(activity.window,'earliest-available');assert.equal(activity.partial,true);
 const report=securityReport(scan(),null,null,null,null,null,activity);
 assert.equal(report.checks.find(c=>c.id==='bundles').state,'observed');assert.equal(report.checks.find(c=>c.id==='clean').state,'unknown');
 assert.equal(securityReport(scan(),null,null,null,null,null,{...activity,mint:bob}).launch,null);
});
test('history scan paginates, stops at its bound, and never calls a recent window the launch',async()=>{
 const calls=[];
 const activity=await scanLaunchActivity(mint,async(method,params)=>{
  if(method==='getSignaturesForAddress'){
   calls.push(params[1]); const page=calls.length;
   return Array.from({length:1000},(_,i)=>({signature:`${page}-${i}`,slot:4000-page*1000-i,err:null}));
  }
  return null;
 });
 assert.equal(calls.length,3);assert.equal(calls[1].before,'1-999');assert.equal(activity.signaturesScanned,3000);assert.equal(activity.window,'recent');assert.equal(activity.historyBoundaryReached,false);assert.equal(activity.transactionsRequested,24);assert.equal(activity.transactionsRead,0);assert.equal(activity.partial,true);
 assert.equal(securityReport(scan(),null,null,null,null,null,activity).checks.find(c=>c.id==='bundles').state,'unknown');
});
test('failed, missing, unrelated and malformed evidence never produces launch clearance',async()=>{
 await assert.rejects(scanLaunchActivity(mint,async()=>{throw new Error('unavailable');}));
 const activity=await scanLaunchActivity(mint,async(method)=>method==='getSignaturesForAddress'?[{signature:'missing',slot:10,err:null},{signature:'failed',slot:11,err:{failed:true}}]:null);
 assert.equal(activity.transactionsRequested,1);assert.equal(activity.tokenTransactionsRead,0);assert.equal(activity.window,'earliest-available');
 assert.equal(securityReport(scan(),null,null,null,null,null,activity).checks.find(c=>c.id==='bundles').state,'unknown');
 const wrong=transaction(alice,10,true);wrong.transaction.message.instructions[0].parsed.info.mint=bob;assert.equal(mintInitialized(wrong,mint),false);
});
test('cross-program creator history uses matching provider attribution and rejects other creators',()=>{
 const provider=providerRisk({mint,creator:alice,creatorTokens:[{mint:bob},{mint:bob},{mint},{mint:'invalid'}]},mint,'now');
 assert.deepEqual(provider.creatorTokens,[bob]);assert.equal(provider.creatorHistoryAvailable,true);
 const other=providerRisk({mint:bob,creator:alice,rugged:true},bob,'now');
 const history={...developerRiskHistory(alice,provider.creatorTokens,[{mint:bob,report:other}]),source:'RugCheck'};
 const report=securityReport(scan(),null,null,null,provider,history);
 assert.equal(report.developer.wallet,alice);assert.equal(report.developer.source,'RugCheck');assert.equal(report.history.checked,1);assert.equal(report.checks.find(c=>c.id==='rugs').state,'attention');
 assert.equal(securityReport(scan(),null,null,null,{...provider,creator:bob},history).history,null);
 assert.equal(securityReport(scan(),null,null,null,{...provider,mint:bob},history).developer,null);
 const empty={...developerRiskHistory(alice,[],[]),source:'RugCheck'};
 assert.equal(securityReport(scan(),null,null,null,provider,empty).checks.find(c=>c.id==='rugs').state,'observed');
 const unavailable={...history,checked:0,entries:[{mint:bob,report:null}]};
 assert.equal(securityReport(scan(),null,null,null,provider,unavailable).checks.find(c=>c.id==='rugs').state,'unknown');
});
