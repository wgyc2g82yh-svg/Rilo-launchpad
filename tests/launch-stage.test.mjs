import test from 'node:test';
import assert from 'node:assert/strict';
import { launchStage } from '../lib/launch-stage.ts';
test('bonding requires an explicit incomplete curve with progress below 100%', () => {
  for (const progress of [0, 22.5, 99.99]) assert.equal(launchStage({ completed: false, graduation_percentage: progress }).stage, 'bonding');
  for (const value of [null, {}, { graduation_percentage: 50 }, { completed: 'false', graduation_percentage: 50 }, { completed: false, graduation_percentage: 100 }, { completed: false, graduation_percentage: -1 }, { completed: false, graduation_percentage: NaN }]) assert.equal(launchStage(value).stage, null);
});
test('graduation requires completion and migration evidence, not market cap or DEX presence', () => {
  assert.equal(launchStage({ completed: true, graduation_percentage: 100 }).stage, null);
  assert.equal(launchStage({ completed: false, graduation_percentage: 50, migrated_destination_pool_address: 'destination' }).stage, null);
  assert.equal(launchStage({ completed: true, migrated_destination_pool_address: 'destination' }).stage, 'graduated');
  assert.equal(launchStage({ market_cap_usd: 1000000, dex: 'pump-swap' }).stage, null);
});
