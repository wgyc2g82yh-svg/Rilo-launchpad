import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Keypair, PublicKey } from '@solana/web3.js';
const program=new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const initial=793100000000000n,supply=1000000000000000n;
const mints=Array.from({length:5},()=>Keypair.generate().publicKey.toBase58());
const curves=mints.map(mint=>PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'),new PublicKey(mint).toBuffer()],program)[0].toBase58());
const globalAddress=PublicKey.findProgramAddressSync([Buffer.from('global')],program)[0].toBase58();
const account=data=>({owner:program.toBase58(),data:[data.toString('base64'),'base64']});
let geckoCalls=0,candidateCalls=0,rpcCalls=0;
const fixture=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');let result;
 if(req.method==='GET'){
  if(url.pathname==='/coins'){
   candidateCalls++;
   if(url.searchParams.get('offset')==='100'){res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');return;}
   if(url.searchParams.get('offset')==='50' && url.searchParams.get('sort')==='market_cap'){res.writeHead(429,{'Content-Type':'application/json'});res.end('{}');return;}
   result=mints.map((mint,index)=>({mint,bonding_curve:Keypair.generate().publicKey.toBase58(),name:'Candidate '+index,symbol:'C'+index,complete:false,usd_market_cap:25000,created_timestamp:Date.now()-60000}));
  }else{geckoCalls++;result={data:[]};}
 }else{
  let text='';for await(const chunk of req)text+=chunk;
  const body=JSON.parse(text);assert.equal(body.method,'getMultipleAccounts');rpcCalls++;
  result={jsonrpc:'2.0',id:body.id,result:{value:body.params[0].map(address=>{
   if(address===globalAddress){const data=Buffer.alloc(105);Buffer.from([167,232,232,177,200,108,114,127]).copy(data);data.writeBigUInt64LE(initial,89);data.writeBigUInt64LE(supply,97);return account(data);}
   const index=curves.indexOf(address);assert.ok(index>=0,'server derives curve addresses rather than trusting metadata');
   const data=Buffer.alloc(160);Buffer.from([23,183,248,55,96,216,172,96]).copy(data);data.writeBigUInt64LE(index===1?initial/20n:index===2?initial/2n:initial/10n,24);data.writeBigUInt64LE(supply,40);
   if(index===3)data[48]=1;
   return index===4?{...account(data),owner:Keypair.generate().publicKey.toBase58()}:account(data);
  })}};
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
});
fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const upstream=`http://127.0.0.1:${fixture.address().port}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,PUMP_API_URL:upstream,GECKO_API_URL:upstream,SOLANA_RPC_URL:upstream},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
const get=async path=>{const response=await fetch(`http://127.0.0.1:${port}/api/rilo/${path}`);assert.equal(response.status,200);return response.json();};
try{
 let ready=false;for(let n=0;n<60;n++){try{if((await fetch(`http://127.0.0.1:${port}/app`)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}assert.ok(ready,logs);
 const result=await get('discover?mode=bonding');
 assert.deepEqual(result.markets.map(market=>market.mint),[mints[1],mints[0]]);
 assert.deepEqual(result.markets.map(market=>market.graduationProgress),[95,90]);
 assert.equal(result.markets[0].pool,curves[1]);assert.equal(result.markets[0].marketCapKind,'fdv');
 assert.equal(result.markets[0].liquidity,null,'unknown metrics stay unknown');
 assert.equal(geckoCalls,0,'verified primary path does not consume Gecko capacity');
 assert.equal(rpcCalls,2,'one global read and one batched curve read');assert.equal(candidateCalls,2);
 await get('discover?mode=bonding');assert.equal(candidateCalls,2,'repeat requests use the snapshot');
 const partial=await get('discover?mode=bonding&page=2');assert.equal(partial.partial,true);assert.equal(partial.markets.length,2,'one candidate outage preserves verified rows');
 const fallback=await get('discover?mode=bonding&page=3');assert.equal(fallback.markets.length,0);assert.equal(fallback.partial,true);assert.match(fallback.coverageNote,/candidates are temporarily unavailable/);assert.ok(geckoCalls>0,'both candidate sources failing uses independent Gecko evidence');
 console.log('Pump discovery API: verified progress, PDA validation, deduplication, cache, partial outage and independent fallback passed.');
}finally{child.kill('SIGTERM');await once(child,'exit');fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}
