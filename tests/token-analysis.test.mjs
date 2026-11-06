import test from 'node:test';
import assert from 'node:assert/strict';
import { isSolanaAddress, percentage, analyzeMint, formatSupply, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../lib/token-analysis.ts';
import { validateDraft, readDraft, EMPTY_DRAFT } from '../lib/launch-draft.ts';
const mint = 'So11111111111111111111111111111111111111112';
const info = { supply: '100000000000000000000', decimals: 9, mintAuthority: null, freezeAuthority: null, isInitialized: true };

test('public keys must decode to exactly 32 bytes', () => {
  assert.equal(isSolanaAddress(mint), true);
  assert.equal(isSolanaAddress('1'.repeat(32)), true);
  for (const invalid of ['1'.repeat(44), 'z'.repeat(44), '0'.repeat(32), 'hello', '']) assert.equal(isSolanaAddress(invalid), false, invalid);
});
test('concentration uses integer precision and preserves unknown zero supply', () => {
  assert.equal(percentage('12345678901234567890', info.supply), 12.3456);
  assert.equal(percentage('0', '0'), null);
  assert.equal(formatSupply('12345678901234567890', 9), '12,345,678,901.23456789');
  assert.equal(formatSupply('123', 6), '0.000123');
});
test('missing data never becomes a clean launch or rug verdict', () => {
  const scan = analyzeMint(mint, TOKEN_PROGRAM, info, null, 42);
  assert.equal(scan.coverage, 'partial');
  assert.equal(scan.topAccountsShare, null);
  assert.equal(scan.checks.find(check => check.title === 'Bundle detection').state, 'unavailable');
  assert.equal(scan.checks.find(check => check.title === 'Developer history').state, 'unavailable');
  assert.equal(scan.checks.find(check => check.title === 'Largest token accounts').state, 'unavailable');
});
test('authorities, concentration and Token-2022 coverage remain visible', () => {
  const scan = analyzeMint(mint, TOKEN_2022_PROGRAM, { ...info, mintAuthority: mint, freezeAuthority: mint }, [{ address: mint, amount: '75000000000000000000' }], 42);
  assert.equal(scan.topAccountsShare, 75);
  assert.equal(scan.checks.filter(check => check.state === 'attention').length, 3);
  assert.equal(scan.checks.find(check => check.title === 'Token extensions').state, 'unavailable');
  assert.throws(() => analyzeMint(mint, TOKEN_PROGRAM, { ...info, freezeAuthority: undefined }, [], 42));
  assert.throws(() => analyzeMint(mint, mint, info, [], 42));
});
test('draft validates ticker, URLs, X handles, description and image types', () => {
  const valid = { ...EMPTY_DRAFT, name: 'Rilo', ticker: 'RILO', website: 'https://riloprotocol.xyz', x: 'RiloProtocol' };
  assert.deepEqual(validateDraft(valid), []);
  for (const change of [{ ticker: 'rilo' }, { website: 'javascript:alert(1)' }, { x: 'name@bad' }, { description: 'a'.repeat(501) }, { image: 'data:image/svg+xml;base64,PHN2Zz4=' }]) assert.ok(validateDraft({ ...valid, ...change }).length > 0);
  assert.deepEqual(readDraft({ name: 'Rilo', ticker: 3, unexpected: true }), { ...EMPTY_DRAFT, name: 'Rilo' });
});
test('draft rejects names beyond on-chain UTF-8 limits before wallet authorization', () => {
 const draft={...EMPTY_DRAFT,ticker:'TEST'};
 assert.deepEqual(validateDraft({...draft,name:'😀'.repeat(8)}),[]);
 assert.ok(validateDraft({...draft,name:'😀'.repeat(9)}).some(message=>message.includes('UTF-8')));
 assert.deepEqual(validateDraft({...draft,name:'é'.repeat(16)}),[]);
 assert.ok(validateDraft({...draft,name:'é'.repeat(17)}).length);
});
