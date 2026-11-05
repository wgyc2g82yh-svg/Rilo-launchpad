import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMint, TOKEN_PROGRAM, TOKEN_2022_PROGRAM } from '../lib/token-analysis.ts';
import { securityReport, newRiskAlerts } from '../lib/security-report.ts';
const mint = 'So11111111111111111111111111111111111111112';
const info = { supply: '1000', decimals: 0, mintAuthority: null, freezeAuthority: null, isInitialized: true };
const scan = (extensions) => analyzeMint(mint, TOKEN_2022_PROGRAM, { ...info, extensions }, null, 10);

test('Token-2022 transfer and authority controls produce attributed review signals', () => {
  for (const extension of ['permanentDelegate', 'transferHook', 'transferFeeConfig', 'defaultAccountState', 'nonTransferable', 'pausableConfig']) {
    const result = scan([{ extension }]);
    const check = result.checks.find(item => item.title === 'Token extensions');
    assert.equal(check.state, 'attention', extension);
    assert.ok(check.detail.includes(extension));
    assert.ok(check.detail.includes('require further verification'));
    const report = securityReport(result, null, null, null);
    assert.equal(report.verdict, 'attention');
    assert.equal(report.checks.find(item => item.id === 'clean').state, 'unknown');
  }
});

test('unknown and absent extension coverage never clears Token-2022 behavior', () => {
  for (const extensions of [undefined, [], [{ extension: 'futureExtension' }], [{ extension: 'metadataPointer' }], [{ extension: '__proto__' }]]) {
    assert.equal(scan(extensions).checks.find(item => item.title === 'Token extensions').state, 'unavailable');
  }
});

test('new extension controls alert even when an earlier control already needed review', () => {
  const before = securityReport(scan([{ extension: 'transferFeeConfig' }]), null, null, null);
  const after = securityReport(scan([{ extension: 'transferFeeConfig' }, { extension: 'permanentDelegate' }]), null, null, null);
  assert.deepEqual(newRiskAlerts(before, after).map(item => item.id), ['extensions']);
});

test('duplicate or inconsistent account snapshots stay unavailable instead of overcounting holdings', () => {
  for (const accounts of [[{ address: mint, amount: '600' }, { address: mint, amount: '600' }], [{ address: mint, amount: '1001' }], [{ address: mint, amount: 'bad' }]]) {
    const result = analyzeMint(mint, TOKEN_PROGRAM, info, accounts, 10);
    assert.equal(result.topAccountsShare, null);
    assert.deepEqual(result.accounts, []);
    assert.equal(result.checks.find(item => item.title === 'Largest token accounts').state, 'unavailable');
  }
});
