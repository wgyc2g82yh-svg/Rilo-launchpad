import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenImageUrl, tokenImageCandidates } from '../lib/token-image.ts';
const cid='Qm'+'a'.repeat(44);
test('image URLs normalize content protocols and reject unsafe or placeholder sources',()=>{
 assert.equal(tokenImageUrl(`ipfs://ipfs/${cid}/logo.png`),`https://ipfs.io/ipfs/${cid}/logo.png`);
 assert.equal(tokenImageUrl('ar://transaction/logo.png'),'https://arweave.net/transaction/logo.png');
 for(const value of ['javascript:alert(1)','data:image/png;base64,a','http://example.com/a.png','https://user:pass@example.com/a.png','https://example.com/missing.png',null]) assert.equal(tokenImageUrl(value),null);
});
test('recovery tries provider alternatives before independent gateways for identical IPFS content',()=>{
 const source=`https://ipfs.io/ipfs/${cid}/logo.png?format=raw`;
 const candidates=tokenImageCandidates(source,'https://cdn.example.com/logo.png',source);
 assert.deepEqual(candidates,[source,'https://cdn.example.com/logo.png',`https://gateway.pinata.cloud/ipfs/${cid}/logo.png?format=raw`,`https://dweb.link/ipfs/${cid}/logo.png?format=raw`]);
 assert.deepEqual(tokenImageCandidates('https://example.com/not-a-cid/logo.png'),['https://example.com/not-a-cid/logo.png']);
 assert.deepEqual(tokenImageCandidates(null),[]);
});
