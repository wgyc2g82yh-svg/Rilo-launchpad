import test from 'node:test';
import assert from 'node:assert/strict';
import { walletConnections } from '../lib/wallet-evidence.ts';
import { providerRisk, developerRiskHistory } from '../lib/provider-risk.ts';
import { securityReport, newRiskAlerts } from '../lib/security-report.ts';
import { analyzeMint, TOKEN_PROGRAM } from '../lib/token-analysis.ts';
const mint = 'So11111111111111111111111111111111111111112', creator = TOKEN_PROGRAM;
const other = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const balance = (owner, amount, accountIndex = 0) => ({ accountIndex, mint, owner, uiTokenAmount: { amount } });
function sample(wallet, signature, slot, { before = '100', after = '200', signer = true, err = null } = {}) {
  return { wallet, signature, tx: { slot, meta: { err, preTokenBalances: [balance(wallet, before)], postTokenBalances: [balance(wallet, after)] }, transaction: { message: { instructions: [], accountKeys: [{ pubkey: wallet, signer }] } } } };
}
const scan = () => analyzeMint(mint, TOKEN_PROGRAM, { supply: '1000', decimals: 0, isInitialized: true, mintAuthority: null, freezeAuthority: null }, null, 42);
test('same-slot accumulation requires separate wallets, successful signatures and positive exact balances', () => {
  const input = [sample('alice', 'one', 20, { before: '900719925474099300', after: '900719925474099301' }), sample('bob', 'two', 20), sample('seller', 'three', 20, { after: '50' }), sample('unsigned', 'four', 20, { signer: false }), sample('failed', 'five', 20, { err: { InstructionError: [0, 'fail'] } })];
  const { accumulation } = walletConnections(mint, [...input, input[0]]);
  assert.equal(accumulation.length, 1); assert.deepEqual(accumulation[0].wallets.sort(), ['alice', 'bob']); assert.equal(accumulation[0].evidence.length, 2); assert.equal(accumulation[0].evidence.find(e => e.wallet === 'alice').amountRaw, '1');
  assert.equal(walletConnections(mint, [sample('alice', 'one', 20), sample('bob', 'two', 21)]).accumulation.length, 0);
});
test('missing owner, missing balances, malformed values and duplicate token-account rows cannot imply accumulation', () => {
  for (const mutate of [s => delete s.tx.meta.preTokenBalances[0].owner, s => delete s.tx.meta.preTokenBalances, s => { s.tx.meta.postTokenBalances[0].uiTokenAmount.amount = 'NaN'; }, s => s.tx.meta.postTokenBalances.push(s.tx.meta.postTokenBalances[0])]) {
    const bad = sample('bob', 'two', 20); mutate(bad);
    assert.equal(walletConnections(mint, [sample('alice', 'one', 20), bad]).accumulation.length, 0);
  }
});
test('public funding evidence deduplicates samples and rejects self-transfers', () => {
  const a = sample('alice', 'one', 20), b = sample('bob', 'two', 21);
  const transfer = wallet => ({ program: 'system', parsed: { type: 'transfer', info: { source: 'fund', destination: wallet, lamports: 100 } } });
  a.tx.transaction.message.instructions = [transfer('alice'), { program: 'system', parsed: { type: 'transfer', info: { source: 'alice', destination: 'alice', lamports: 100 } } }];
  b.tx.meta.innerInstructions = [{ instructions: [transfer('bob')] }];
  const groups = walletConnections(mint, [a, b, a]).sharedFunding;
  assert.equal(groups.length, 1); assert.equal(groups[0].evidence.length, 2); assert.deepEqual(groups[0].wallets.sort(), ['alice', 'bob']);
});
test('RugCheck normalization requires matching mint and explicit boolean status', () => {
  assert.equal(providerRisk({ mint: other, rugged: true }, mint, 'now'), null);
  assert.equal(providerRisk({ mint, rugged: 'true', risks: [{ name: 'bad', level: 'unsupported' }] }, mint, 'now').rugged, null);
  const report = providerRisk({ mint, creator, rugged: true, risks: [{ name: 'warning\nname', level: 'danger', description: 'Details' }] }, mint, 'now');
  assert.equal(report.rugged, true); assert.equal(report.risks[0].name, 'warning name');
});
test('developer history excludes unrelated creators and does not count inactive launches as rugs', () => {
  const valid = providerRisk({ mint: other, creator, rugged: true }, other, 'now');
  const history = developerRiskHistory(creator, [other, mint, other], [{ mint: other, report: valid }, { mint, report: providerRisk({ mint, creator: other, rugged: true }, mint, 'now') }, { mint: other, report: valid }]);
  assert.equal(history.totalKnown, 2); assert.equal(history.sampled, 2); assert.equal(history.checked, 1); assert.equal(history.entries[1].report, null);
  const pool = { mint, creator, historyAvailable: true, history: [] };
  const report = securityReport(scan(), null, pool, null, null, history);
  assert.equal(report.checks.find(c => c.id === 'rugs').state, 'attention');
  assert.equal(report.checks.find(c => c.id === 'clean').state, 'unknown');
  assert.equal(securityReport(scan(), null, { ...pool, mint: other }, null, null, history).checks.find(c => c.id === 'rugs').state, 'unknown');
});
test('missing provider status remains unknown and clear provider flags never certify safety', () => {
  for (const rugged of [undefined, false]) {
    const report = securityReport(scan(), null, null, null, providerRisk({ mint, rugged, risks: [] }, mint, 'now'));
    assert.equal(report.checks.find(c => c.id === 'provider').state, rugged === false ? 'observed' : 'unknown');
    assert.equal(report.verdict, 'incomplete');
  }
  const warning = securityReport(scan(), null, null, null, providerRisk({ mint, risks: [{ name: 'Danger', level: 'danger' }] }, mint, 'now'));
  assert.equal(warning.checks.find(c => c.id === 'provider').state, 'attention');
});
test('additional risky evidence alerts even when the check is already attention', () => {
  const provider = risks => providerRisk({ mint, rugged: false, risks: risks.map(name => ({ name, level: 'warn' })) }, mint, 'now');
  const a = securityReport(scan(), null, null, null, provider(['First'])), b = securityReport(scan(), null, null, null, provider(['First', 'Second']));
  assert.deepEqual(newRiskAlerts(a, b).map(c => c.id), ['provider']); assert.deepEqual(newRiskAlerts(b, b), []);
});
test('linked supply uses unique sampled owners and exact raw balances without claiming missing holdings', () => {
  const wallets = { sampledWallets: 2, transactionsRead: 2, incomplete: true, owners: [{ wallet: 'alice', accounts: 2, amountRaw: '100' }, { wallet: 'bob', accounts: 1, amountRaw: '200' }], sharedFunding: [{ source: 'fund', wallets: ['alice', 'bob'], evidence: [] }, { source: 'fund2', wallets: ['alice', 'bob'], evidence: [] }] };
  assert.equal(securityReport(scan(), wallets, null, null).linkedSupplyPercent, 30);
  assert.equal(securityReport(scan(), { ...wallets, owners: wallets.owners.slice(0, 1) }, null, null).linkedSupplyPercent, null);
  assert.equal(securityReport(scan(), { ...wallets, owners: [{ ...wallets.owners[0], amountRaw: '9999' }, wallets.owners[1]] }, null, null).linkedSupplyPercent, null);
});
