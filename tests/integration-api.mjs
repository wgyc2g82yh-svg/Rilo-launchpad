import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac, createHash } from 'node:crypto';
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
const genesis='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const mint='So11111111111111111111111111111111111111112',token='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const extendedMint='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const pastMint=Keypair.generate().publicKey.toBase58(),earlyWallet=Keypair.generate().publicKey.toBase58();
const signer=Keypair.generate(),receiver=Keypair.generate(),secret='test-only-signing-secret-never-use-in-production';
const signature=bs58.encode(new Uint8Array(64).fill(3));
const hash=value=>createHash('sha256').update(value).digest('hex');
function ticket(value){const data=Buffer.from(JSON.stringify(value)).toString('base64url');return `${data}.${createHmac('sha256',secret).update(data).digest('base64url')}`;}
let sent=0,executed=0,failMigration=false,failTrending=false,failTokenPools=false;
let liveCap=12345, livePrice="0.01";
const freshMint=Keypair.generate().publicKey.toBase58(), curveOnlyMint=Keypair.generate().publicKey.toBase58(), curveOnlyPool=Keypair.generate().publicKey.toBase58();
let fixtureProgress=85;
const chartRequests=[], discoveryPages=[], throttledPages=[], tokenPoolRequests=[];
const fixture=createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');let result;
  if(request.method==='GET'){
    if(url.pathname.includes('/tokens/') && url.pathname.endsWith('/pools'))tokenPoolRequests.push(url.pathname);
    if(failTokenPools && url.pathname.includes('/tokens/') && url.pathname.endsWith('/pools')){response.statusCode=503;response.end('{}');return;}
    if(failTrending && url.pathname.endsWith('/trending_pools')){throttledPages.push(url.searchParams.get('page'));response.statusCode=429;response.setHeader('Retry-After','120');response.setHeader('Content-Type','application/json');response.end(JSON.stringify({error:'fixture rate limit'}));return;}
    if(url.pathname.endsWith('/order')){
      const wallet=url.searchParams.get('taker');
      const tx=wallet?new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(wallet),recentBlockhash:mint,instructions:[SystemProgram.transfer({fromPubkey:new PublicKey(wallet),toPubkey:receiver.publicKey,lamports:1})]}).compileToV0Message()):null;
      result={inputMint:url.searchParams.get('inputMint'),outputMint:url.searchParams.get('outputMint'),inAmount:url.searchParams.get('amount'),outAmount:'900000',otherAmountThreshold:'891000',feeBps:2,feeMint:mint,slippageBps:100,priceImpactPct:'0.1',router:'fixture',requestId:'fixture-order',transaction:tx?Buffer.from(tx.serialize()).toString('base64'):null};
    }else if(url.pathname.endsWith(`/tokens/${pastMint}/report`))result={mint:pastMint,creator:signer.publicKey.toBase58(),rugged:true,risks:[]};
    else if(url.pathname.endsWith('/report'))result={mint:token,creator:signer.publicKey.toBase58(),rugged:true,creatorTokens:[{mint:pastMint},{mint:extendedMint},{mint:token}],risks:[{name:'Fixture risk',level:'danger',description:'Provider warning fixture'}],markets:[{pubkey:mint,mintA:token,mintB:mint,mintLP:token,lp:{lpLocked:75,lpUnlocked:25,lpLockedPct:75}}]};
    else if(url.pathname.includes('/ohlcv/')){chartRequests.push({path:url.pathname,aggregate:url.searchParams.get('aggregate'),side:url.searchParams.get('token')});result={data:{attributes:{ohlcv_list:[[120,1,2,1,2,30],[60,1,1,1,1,20]]}}};}
    else if(url.pathname.endsWith('/tokens/v1/solana/'+pastMint)){response.statusCode=503;response.end('{}');return;}
    else if(url.pathname.endsWith('/tokens/'+pastMint+'/pools'))result={data:[{id:'fallback-pool',attributes:{address:mint,name:'FALLBACK / SOL',base_token_price_usd:'0.01'},relationships:{base_token:{data:{id:`solana_${pastMint}`}}}}]};
    else if(url.pathname.includes('/tokens/v1/solana/')) result=[{chainId:'solana',pairAddress:mint,baseToken:{address:token,name:'Fixture token',symbol:'TEST'},marketCap:liveCap,priceUsd:livePrice,volume:{h24:1000},liquidity:{usd:5000}},{chainId:'solana',pairAddress:receiver.publicKey.toBase58(),baseToken:{address:extendedMint},fdv:67890}];
    else if(url.pathname.includes('/dexes/pump-fun/pools'))result={data:[{id:'curve-only-pool',attributes:{address:curveOnlyPool,name:'CURVE / SOL',pool_created_at:new Date(Date.now()-120000).toISOString()},relationships:{base_token:{data:{id:`solana_${curveOnlyMint}`}},dex:{data:{id:'pump-fun'}}}}]};
    else if(url.pathname.includes('/tokens/multi/')) result={data:[{id:`solana_${curveOnlyMint}`,attributes:{launchpad_details:{completed:false,graduation_percentage:96}}},{id:`solana_${token}`,attributes:{launchpad_details:{completed:false,graduation_percentage:fixtureProgress}}},{id:`solana_${freshMint}`,attributes:{launchpad_details:{completed:false,graduation_percentage:5}}},{id:`solana_${extendedMint}`,attributes:{launchpad_details:{completed:true,graduation_percentage:100,migrated_destination_pool_address:receiver.publicKey.toBase58()}}}]};
    else if(url.pathname.includes('/pools/multi/') && failMigration){response.statusCode=429;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({error:'fixture rate limit'}));return;}
    else if(url.pathname.includes('/pools/multi/')) result={data:[{id:`solana_${receiver.publicKey}`,attributes:{address:receiver.publicKey.toBase58(),name:'GRAD / SOL',volume_usd:{h24:'9999'}},relationships:{base_token:{data:{id:`solana_${extendedMint}`}},dex:{data:{id:'destination-dex'}}}}]};
    else result={data:[{id:`solana_${mint}`,attributes:{address:mint,name:'RILO / SOL',base_token_price_usd:'0.01',volume_usd:{h24:'1000'},reserve_in_usd:'5000',price_change_percentage:{h24:'2.5'},pool_created_at:new Date(Date.now()-60000).toISOString()},relationships:{base_token:{data:{id:`solana_${token}`}},quote_token:{data:{id:`solana_${mint}`}},dex:{data:{id:'pump-fun'}}}},{id:`solana_${signer.publicKey}`,attributes:{address:signer.publicKey.toBase58(),name:'GRAD / SOL'},relationships:{base_token:{data:{id:`solana_${extendedMint}`}}}},{id:'fresh-pool',attributes:{address:earlyWallet,name:'NEW / SOL',pool_created_at:new Date(Date.now()-30000).toISOString()},relationships:{base_token:{data:{id:`solana_${freshMint}`}},dex:{data:{id:'pump-fun'}}}}],included:[{id:`solana_${token}`,attributes:{name:'Fixture token',symbol:'TEST',decimals:6,image_url:'https://example.com/token.png'}}]};
    if(url.pathname.endsWith('/new_pools') || url.pathname.endsWith('/trending_pools')) discoveryPages.push(url.searchParams.get('page'));
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result));return;
  }
  let body='';for await(const chunk of request)body+=chunk;const input=JSON.parse(body);
  if(url.pathname.endsWith('/execute')){executed++;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({status:'Success',signature}));return;}
  if(input.method==='getAssetBatch')result=input.params.ids.map(id=>({id,content:{links:{image:'https://example.com/'+id+'.png'}}}));
  else if(input.method==='getGenesisHash')result=genesis;
  else if(input.method==='getProgramAccounts')result=[];
  else if(input.method==='getAccountInfo')result={context:{slot:101},value:{owner:input.params[0]===extendedMint?extendedMint:token,data:{parsed:{type:'mint',info:{supply:'1000000',decimals:6,mintAuthority:null,freezeAuthority:null,isInitialized:true,...(input.params[0]===extendedMint?{extensions:[{extension:'permanentDelegate',state:{delegate:mint}}]}:{})}}}}};
  else if(input.method==='getTokenLargestAccounts')result={value:[{address:signer.publicKey.toBase58(),amount:'100'},{address:receiver.publicKey.toBase58(),amount:'100'}]};
  else if(input.method==='getMultipleAccounts')result={value:[signer,receiver].map(key=>({data:{parsed:{type:'account',info:{owner:key.publicKey.toBase58(),mint:token,tokenAmount:{amount:'100'}}}}}))};
  else if(input.method==='getSignaturesForAddress' && input.params[0]===token)result=[{signature:'early-second',slot:100,err:null},{signature:'early-first',slot:100,err:null}];
  else if(input.method==='getSignaturesForAddress')result=[{signature:'missing-'+input.params[0],err:null},{signature:input.params[0],err:null}];
  else if(input.method==='getTransaction'){
    const owner=input.params[0];
    if(owner.startsWith('early-')){const wallet=owner==='early-first'?earlyWallet:receiver.publicKey.toBase58();result={slot:100,meta:{err:null,preTokenBalances:[],postTokenBalances:[{accountIndex:0,mint:token,owner:wallet,uiTokenAmount:{amount:'100'}}]},transaction:{message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:owner==='early-first'?[{program:'spl-token',parsed:{type:'initializeMint2',info:{mint:token}}}]:[]}}};}
    else if(owner.startsWith('missing-'))result=null;else result={slot:100,meta:{err:null,preTokenBalances:[],postTokenBalances:[{accountIndex:0,mint:token,owner,uiTokenAmount:{amount:'100'}}]},transaction:{message:{accountKeys:[{pubkey:owner,signer:true}],instructions:[{program:'system',parsed:{type:'transfer',info:{source:mint,destination:owner,lamports:100000}}}]}}};
  }
  else if(input.method==='sendTransaction'){sent++;result=signature;}
  else if(input.method==='getSignatureStatuses')result={value:[{err:null,confirmationStatus:'confirmed'}]};
  else result=null;
  response.setHeader('Content-Type','application/json');response.end(JSON.stringify({jsonrpc:'2.0',id:1,result}));
});
fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const base=`http://127.0.0.1:${port}`,upstream=`http://127.0.0.1:${fixture.address().port}`;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,SOLANA_RPC_URL:upstream,GECKO_API_URL:upstream,DEXSCREENER_API_URL:upstream,RUGCHECK_API_URL:upstream,JUPITER_API_URL:upstream,JUPITER_API_KEY:'fixture-only',APP_SIGNING_SECRET:secret,APP_ORIGIN:base,ENABLE_MAINNET_TRANSACTIONS:'true'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
const get=async(path)=>{const r=await fetch(base+'/api/rilo/'+path);return {status:r.status,retryAfter:r.headers.get('Retry-After'),body:await r.json()};};
const post=async(path,body,origin=base)=>{const r=await fetch(base+'/api/rilo/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
try{
  let ready=false;for(let n=0;n<60;n++){try{if((await fetch(base+'/app')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
  const feed=await get('discover?mode=trending');assert.equal(feed.status,200);assert.equal(feed.body.markets[0].symbol,'TEST');assert.equal(feed.body.markets[0].volume24h,1000);assert.equal(feed.body.markets[0].imageUrl,'https://example.com/token.png');
  assert.equal(feed.body.markets[0].marketCap,12345);assert.equal(feed.body.markets[0].marketCapKind,'reported');
  const secondPage=await get('discover?mode=new&page=2');assert.equal(secondPage.status,200);assert.equal(secondPage.body.page,2);assert.ok(discoveryPages.includes('2'));
  for(const page of ['0','11','1.5','nope'])assert.equal((await get('discover?mode=new&page='+page)).status,400);
  const quotes=await get('market/quotes?mints='+token);assert.equal(quotes.status,200);assert.equal(quotes.body.markets[0].marketCap,12345);
  assert.equal((await get('market/quotes?mints=invalid')).status,400);
  const fresh=await get('discover?mode=new');assert.equal(fresh.status,200);assert.equal(fresh.body.markets.length,1);assert.equal(fresh.body.markets[0].mint,freshMint);assert.equal(fresh.body.markets[0].imageUrl,'https://example.com/'+freshMint+'.png','missing feed and quote images recover from mint-matched DAS metadata');
  const bonding=await get('discover?mode=bonding');assert.equal(bonding.status,200);assert.deepEqual(bonding.body.markets.map(m=>m.mint),[curveOnlyMint,token]);assert.equal(bonding.body.markets[0].graduationProgress,96,'curve-specific candidates are included even when absent from broad discovery');
  const graduated=await get('discover?mode=graduated');assert.equal(graduated.status,200);assert.deepEqual(graduated.body.markets.map(m=>m.mint),[extendedMint]);assert.equal(graduated.body.markets[0].pool,receiver.publicKey.toBase58());assert.equal(graduated.body.markets[0].marketCap,67890);assert.equal(graduated.body.markets[0].marketCapKind,'fdv');assert.equal(graduated.body.markets[0].volume24h,9999,'graduated token uses destination pool metrics');
  failMigration=true;
  const partialBonding=await get('discover?mode=bonding&page=3');assert.equal(partialBonding.status,200);assert.ok(partialBonding.body.markets.some(m=>m.mint===token));
  const partialGraduated=await get('discover?mode=graduated&page=3');assert.equal(partialGraduated.status,200);assert.equal(partialGraduated.body.markets[0].pool,receiver.publicKey.toBase58());assert.equal(partialGraduated.body.markets[0].volume24h,null,'unavailable destination metrics never reuse the retired curve');
  failMigration=false;
  failTrending=true;
  const survivingBonding=await get('discover?mode=bonding&page=4');assert.equal(survivingBonding.status,200);assert.ok(survivingBonding.body.markets.some(m=>m.mint===token));assert.equal(survivingBonding.body.partial,true,'one throttled candidate source does not discard verified launches');
  const survivingGraduated=await get('discover?mode=graduated&page=4');assert.equal(survivingGraduated.status,200);assert.equal(survivingGraduated.body.markets[0].pool,receiver.publicKey.toBase58());
  const throttled=await get('discover?mode=trending&page=5');assert.equal(throttled.status,429);assert.equal(throttled.retryAfter,'120');
  assert.equal((await get('discover?mode=trending&page=5')).status,429);assert.equal(throttledPages.filter(page=>page==='5').length,1,'cold failures respect upstream backoff instead of repeating the provider request');
  failTrending=false;
  const tokenMarket=await get(`market?mint=${token}`);assert.equal(tokenMarket.status,200);assert.equal(tokenMarket.body.markets[0].marketCap,12345);assert.equal(tokenMarket.body.markets[0].decimals,null);assert.equal(tokenPoolRequests.length,0,'indexed token quotes avoid another call to the constrained discovery provider');
  failTokenPools=true;
  const fallbackMarket=await get(`market?mint=${extendedMint}`);assert.equal(fallbackMarket.status,200);assert.equal(fallbackMarket.body.partial,false);assert.equal(tokenPoolRequests.length,0);assert.equal(fallbackMarket.body.markets[0].mint,extendedMint);assert.equal(fallbackMarket.body.markets[0].marketCap,67890);assert.equal(fallbackMarket.body.markets[0].pool,receiver.publicKey.toBase58());
  failTokenPools=false;
  const secondaryMarket=await get(`market?mint=${pastMint}`);assert.equal(secondaryMarket.status,200);assert.equal(secondaryMarket.body.markets[0].mint,pastMint);assert.equal(secondaryMarket.body.partial,true);assert.equal(tokenPoolRequests.length,1,'a missing quote provider still falls back to the secondary pool source');
  const liquidity=await get(`liquidity?mint=${token}&pool=${mint}`);assert.equal(liquidity.status,200);assert.equal(liquidity.body.status,'partial');assert.equal(liquidity.body.lockedPercent,75);assert.equal(liquidity.body.developerControl,'unverified');
  assert.equal((await get(`liquidity?mint=${token}&pool=${signer.publicKey.toBase58()}`)).body.status,'unknown');
  const security=await get(`security?mint=${token}&pool=${mint}`);assert.equal(security.status,200,JSON.stringify(security));
  assert.equal(security.body.developer.wallet,signer.publicKey.toBase58());assert.equal(security.body.developer.source,'RugCheck');assert.equal(security.body.history.source,'RugCheck');assert.equal(security.body.history.totalKnown,2);assert.equal(security.body.history.checked,1);assert.equal(security.body.checks.find(c=>c.id==='rugs').state,'attention');
  assert.equal(security.body.launch.window,'launch');assert.equal(security.body.launch.sampledWallets,2);assert.ok(security.body.launch.accumulation[0].wallets.includes(earlyWallet),'early participants are examined even after exiting current holders');assert.equal(security.body.launch.initializationSignature,'early-first');
  assert.equal(security.body.provider.rugged,true);assert.equal(security.body.checks.find(c=>c.id==='provider').state,'attention');
  assert.equal(security.body.wallets.sharedFunding.length,1);assert.equal(security.body.wallets.accumulation.length,1);
  assert.equal(security.body.checks.find(c=>c.id==='bundles').state,'attention');assert.equal(security.body.checks.find(c=>c.id==='clean').state,'unknown');
  const extended=await get(`security?mint=${extendedMint}`);assert.equal(extended.status,200);
  assert.equal(extended.body.checks.find(c=>c.id==='extensions').state,'attention');
  assert.equal(extended.body.provider,null,'mismatched provider mint is discarded');
  assert.equal(extended.body.checks.find(c=>c.id==='clean').state,'unknown');
  const chart=await get(`chart?pool=${mint}&side=base`);assert.equal(chart.body.candles[0].time,60);
  assert.equal(chart.body.interval,'5m');
  const live=await get(`chart?pool=${mint}&side=base&interval=live`);assert.equal(live.status,200);assert.equal(live.body.refreshMs,15000);
  const fourHour=await get(`chart?pool=${mint}&side=quote&interval=4h`);assert.equal(fourHour.status,200);assert.equal(fourHour.body.interval,'4h');
  assert.deepEqual(chartRequests,[{path:`/networks/solana/pools/${mint}/ohlcv/minute`,aggregate:'5',side:'base'},{path:`/networks/solana/pools/${mint}/ohlcv/minute`,aggregate:'1',side:'base'},{path:`/networks/solana/pools/${mint}/ohlcv/hour`,aggregate:'4',side:'quote'}]);
  await get(`chart?pool=${mint}&side=base&interval=live`);assert.equal(chartRequests.length,3,'interval-specific cache reuses matching requests');
  for(const invalid of ['1h','__proto__','constructor'])assert.equal((await get(`chart?pool=${mint}&interval=${invalid}`)).status,400);
  assert.equal((await get(`chart?pool=${mint}&side=invalid&interval=live`)).status,400);
  assert.equal((await get('discover?mode=bad')).status,400);
  assert.equal((await post('transaction/submit',{},'https://attacker.example')).status,403);
  assert.equal((await get('curve')).status,503);
  const order=await get(`order?inputMint=${mint}&outputMint=${token}&amount=10000000&wallet=${signer.publicKey.toBase58()}`);assert.equal(order.status,200);assert.ok(order.body.ticket);
  const signed=VersionedTransaction.deserialize(Buffer.from(order.body.transaction,'base64'));signed.sign([signer]);
  const wrong=VersionedTransaction.deserialize(Buffer.from(order.body.transaction,'base64'));wrong.message.recentBlockhash=token;wrong.sign([signer]);
  assert.equal((await post('swap/execute',{ticket:order.body.ticket,transaction:Buffer.from(wrong.serialize()).toString('base64')})).status,400);assert.equal(executed,0);
  const swap=await post('swap/execute',{ticket:order.body.ticket,transaction:Buffer.from(signed.serialize()).toString('base64')});assert.equal(swap.body.status,'confirmed');assert.equal(executed,1);
  const tx=new Transaction({feePayer:signer.publicKey,recentBlockhash:mint}).add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:receiver.publicKey,lamports:1}));tx.sign(signer);
  const payload={kind:'built',wallet:signer.publicKey.toBase58(),message:hash(tx.serializeMessage()),expiresAt:Date.now()+60000,action:'fixture',genesis};
  const expired=ticket({...payload,expiresAt:Date.now()-1000});assert.equal((await post('transaction/submit',{ticket:expired,transaction:tx.serialize().toString('base64')})).status,409);assert.equal(sent,0);
  const changed=ticket({...payload,message:hash('altered')});assert.equal((await post('transaction/submit',{ticket:changed,transaction:tx.serialize().toString('base64')})).status,400);assert.equal(sent,0);
  const submitted=await post('transaction/submit',{ticket:ticket(payload),transaction:tx.serialize().toString('base64')});assert.equal(submitted.body.status,'submitted');assert.equal(sent,1);
  assert.equal((await get(`transaction?signature=${signature}`)).body.status,'confirmed');
  const profile={name:'Rilo',ticker:'RILO',description:'',website:'',x:'',image:''};
  const proof=ticket({kind:'profile',wallet:signer.publicKey.toBase58(),mint,profileHash:hash(JSON.stringify(profile)),origin:base,expiresAt:Date.now()+60000});
  assert.equal((await post('launch/prepare',{ticket:proof,profile,signature:'bad'})).status,403);
  fixtureProgress=20;
  const earlyStage=await get('discover?mode=new&page=6');assert.equal(earlyStage.status,200);assert.ok(earlyStage.body.markets.some(m=>m.mint===token));
  assert.ok(!(await get('discover?mode=bonding&page=6')).body.markets.some(m=>m.mint===token));
  fixtureProgress=97;
  const nearing=await get('discover?mode=bonding&page=7');assert.equal(nearing.status,200);assert.equal(nearing.body.markets.find(m=>m.mint===token).graduationProgress,97);
  const afterMove=await get('discover?mode=new&page=7');assert.ok(!afterMove.body.markets.some(m=>m.mint===token));assert.ok(afterMove.body.excludedMints.includes(token));
  const beforeLive=await get('market/quotes?mints='+token);
  liveCap=23456.78;livePrice="0.02";
  const cachedQuote=await get('market/quotes?mints='+token);
  assert.equal(cachedQuote.body.markets[0].marketCap,beforeLive.body.markets[0].marketCap);
  assert.equal(cachedQuote.body.observedAt,beforeLive.body.observedAt,'cache hits retain original quote timestamps');
  await new Promise(resolve=>setTimeout(resolve,5100));
  const liveQuote=await get('market/quotes?mints='+token);
  assert.equal(liveQuote.body.refreshMs,5000);
  assert.equal(liveQuote.body.markets[0].marketCap,23456.78);
  assert.equal(liveQuote.body.markets[0].price,0.02);
  assert.ok(Date.parse(liveQuote.body.observedAt)>Date.parse(beforeLive.body.observedAt));
  console.log('PASS: live cap/price updates after five-second cache expiry; quote cache timestamps remain honest.');
  console.log('PASS: integration API fixtures — feed, candles, CSRF origin, missing launch config, wallet-bound quote, swap message integrity, expired/tampered action tickets, signed submission, confirmation and forged profile rejection. No live transactions sent.');
}finally{child.kill('SIGTERM');fixture.close();await once(child,'exit');}
