import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const mint = 'So11111111111111111111111111111111111111112';
const partial = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const nonMint = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const absent = '11111111111111111111111111111111';
const info = { supply: '100000000000000000000', decimals: 9, mintAuthority: mint, freezeAuthority: null, isInitialized: true };
let upstreamCalls = 0;
const fixture = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const { method, params } = JSON.parse(body);
  upstreamCalls++;
  let result;
  if (method === 'getGenesisHash') result = 'test-cluster';
  else if (method === 'getAccountInfo') result = {
    context: { slot: 1234 }, value: params[0] === absent ? null : {
      owner: partial, data: { parsed: { type: params[0] === nonMint ? 'account' : 'mint', info } },
    },
  };
  else if (method === 'getTokenLargestAccounts' && params[0] === partial) {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'secret-provider-diagnostic' } }));
    return;
  } else if (method === 'getTokenLargestAccounts') result = { value: [{ address: mint, amount: '75000000000000000000' }] };
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
});
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, SOLANA_RPC_URL: `http://127.0.0.1:${fixture.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; child.stdout.on('data', chunk => logs += chunk); child.stderr.on('data', chunk => logs += chunk);
const base = `http://127.0.0.1:${port}`;
const get = async path => { const response = await fetch(base + path); return { status: response.status, body: await response.json() }; };
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(base + '/app')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `App failed to start: ${logs}`);
  assert.equal((await get('/api/solana/status')).body.connected, true);
  const invalid = await get('/api/solana/scan?mint=invalid'); assert.equal(invalid.status, 400);
  const result = await get(`/api/solana/scan?mint=${mint}`);
  assert.equal(result.status, 200); assert.equal(result.body.topAccountsShare, 75);
  assert.equal(result.body.coverage, 'partial');
  assert.equal(result.body.checks.find(check => check.title === 'Bundle detection').state, 'unavailable');
  const before = upstreamCalls; await get(`/api/solana/scan?mint=${mint}`); assert.equal(upstreamCalls, before, 'cache avoids duplicate RPC calls');
  const missingHolders = await get(`/api/solana/scan?mint=${partial}`);
  assert.equal(missingHolders.status, 200); assert.equal(missingHolders.body.topAccountsShare, null);
  assert.ok(!JSON.stringify(missingHolders).includes('secret-provider-diagnostic'));
  assert.equal((await get(`/api/solana/scan?mint=${nonMint}`)).status, 422);
  assert.equal((await get(`/api/solana/scan?mint=${absent}`)).status, 404);
  console.log('PASS: built app, RPC status, valid scan, missing holder coverage, sanitized errors, cache, invalid address, non-mint and absent account responses (local RPC fixture).');
} finally {
  child.kill('SIGTERM'); fixture.close();
  await once(child, 'exit');
}
