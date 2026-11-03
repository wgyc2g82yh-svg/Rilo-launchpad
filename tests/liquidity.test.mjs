import test from 'node:test';
import assert from 'node:assert/strict';
import { liquidityEvidence } from '../lib/liquidity-evidence.ts';
import { tokenImageUrl } from '../lib/token-image.ts';
const mint='token',pool='pool',observedAt='2026-11-03T00:00:00Z';
const report=(lp,extra={})=>({mint,creator:'creator',markets:[{pubkey:pool,mintA:mint,mintB:'quote',mintLP:'lp-token',lp,...extra}]});
const parse=value=>liquidityEvidence(value,mint,pool,observedAt);
test('liquidity percentages distinguish full, partial and unlocked LP evidence',()=>{
 assert.equal(parse(report({lpLocked:100,lpUnlocked:0,lpLockedPct:100})).status,'locked');
 assert.equal(parse(report({lpLocked:75,lpUnlocked:25,lpLockedPct:75})).status,'partial');
 const unlocked=parse(report({lpLocked:0,lpUnlocked:100,lpLockedPct:0}));
 assert.equal(unlocked.status,'unlocked');assert.equal(unlocked.developerControl,'unverified');
});
test('missing, malformed, inconsistent, mismatched and position-based LP data stays unknown',()=>{
 for(const value of [null,{},report({}),report({lpLocked:0,lpUnlocked:0,lpLockedPct:0}),report({lpLocked:100,lpUnlocked:0,lpLockedPct:100},{mintLP:'11111111111111111111111111111111'}),report({lpLocked:-1,lpUnlocked:100,lpLockedPct:0}),report({lpLocked:100,lpUnlocked:0,lpLockedPct:75}),report({lpLocked:100,lpUnlocked:0,lpLockedPct:101}),report({lpLocked:100,lpUnlocked:0,lpLockedPct:'100'}),{...report({lpLocked:100,lpUnlocked:0,lpLockedPct:100}),mint:'different-token'},report({lpLocked:100,lpUnlocked:0,lpLockedPct:100},{pubkey:'different-pool'})]) {
  const valueResult=parse(value);assert.equal(valueResult.status,'unknown');assert.equal(valueResult.lockedPercent,null);
 }
});
test('token artwork supports HTTPS and IPFS with no executable or insecure URL schemes',()=>{
 assert.equal(tokenImageUrl('https://example.com/token.png'),'https://example.com/token.png');
 assert.equal(tokenImageUrl('ipfs://ipfs/QmImage/token.png'),'https://ipfs.io/ipfs/QmImage/token.png');
 for(const value of [null,'','javascript:alert(1)','data:image/svg+xml,test','http://example.com/logo.png','https://user:secret@example.com/logo.png','https://example.com/missing.png'])assert.equal(tokenImageUrl(value),null);
});
