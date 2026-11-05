import test from 'node:test';
import assert from 'node:assert/strict';
import { securityReport, newRiskAlerts } from '../lib/security-report.ts';
import { analyzeMint, TOKEN_PROGRAM } from '../lib/token-analysis.ts';
const mint = 'So11111111111111111111111111111111111111112';
const info = { supply:'1000', decimals:0, mintAuthority:null, freezeAuthority:null, isInitialized:true };
const scan = (changes = {}) => analyzeMint(mint, TOKEN_PROGRAM, {...info,...changes}, null, 42);
test('provider failures and revoked authorities never certify a clean launch', () => {
  const report = securityReport(scan(), null, null, null);
  assert.equal(report.verdict, 'incomplete');
  for (const id of ['concentration','funding','creator','rugs','liquidity','bundles','clean']) assert.equal(report.checks.find(c => c.id === id).state, 'unknown');
});
test('shared funding warns without asserting bundling or a rug', () => {
  const wallets = { sampledWallets:2, transactionsRead:3, incomplete:true, owners:[], sharedFunding:[{source:mint,wallets:[mint,mint],evidence:[]}] };
  const report = securityReport(scan(), wallets, null, null);
  assert.equal(report.verdict, 'attention');
  assert.equal(report.checks.find(c => c.id === 'funding').state, 'attention');
  assert.equal(report.checks.find(c => c.id === 'bundles').state, 'unknown');
});
test('monitor alerts only new attention and never carries signals across mints', () => {
  const previous = securityReport(scan(), null, null, null);
  const next = securityReport(scan({mintAuthority:mint}), null, null, null);
  assert.deepEqual(newRiskAlerts(previous,next).map(c => c.id), ['mint']);
  assert.deepEqual(newRiskAlerts(next,next), []);
  assert.deepEqual(newRiskAlerts({...previous,mint:'another'},next), []);
});
test('unknown liquidity cannot be treated as locked', () => {
  const report = securityReport(scan(), null, null, {status:'unknown',detail:'No coverage'});
  assert.equal(report.checks.find(c => c.id === 'liquidity').state, 'unknown');
});
