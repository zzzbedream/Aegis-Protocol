import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketParams, applicationIdFromRequestId, borrowForCollateral } from '../lib/market.mjs';

test('borrowForCollateral: 1,000 tZEN at $7.93 and 65 % → 5,154.5 aUSDC', () => {
  assert.equal(borrowForCollateral(1000n * 10n ** 18n, 7_930000000000000000n, 6500n), 5_154_500_000n);
  assert.throws(() => borrowForCollateral(0n, 1n, 6500n), /invalid/);
});

test('seed ratio is inside the LTV and liquidatable after a -30 % shock', () => {
  const ratio = 0.65, ltv = 0.75, threshold = 0.8, shock = 0.7;
  assert.ok(ratio < ltv);
  assert.ok(ratio > shock * threshold);
});

const d = { usdc: '0x' + 'AB'.repeat(20), zen: '0x' + 'CD'.repeat(20) };
const treasury = '0x' + 'EF'.repeat(20);

test('marketParams builds the guest constructor JSON with lowercase addresses', () => {
  const p = marketParams(d, treasury);
  assert.deepEqual(p.debt, { address: d.usdc.toLowerCase(), decimals: 6 });
  assert.deepEqual(p.collaterals, [
    { address: d.zen.toLowerCase(), decimals: 18, ltvBps: 7500, liqThresholdBps: 8000, liqBonusBps: 500 },
  ]);
  assert.equal(p.treasury, treasury.toLowerCase());
  assert.equal(p.reserveFactorBps, 1000);
  assert.equal(p.closeFactorBps, 5000);
  assert.equal('aml' in p, false, 'AML stays disabled in the demo');
});

test('marketParams keeps liquidation at the threshold solvent: LT * (1 + bonus) < 100 %', () => {
  const [c] = marketParams(d, treasury).collaterals;
  assert.ok(c.ltvBps < c.liqThresholdBps);
  assert.ok(c.liqThresholdBps * (10_000 + c.liqBonusBps) < 10_000 * 10_000);
});

test('marketParams validates addresses', () => {
  assert.throws(() => marketParams({ ...d, zen: 'nope' }, treasury), /zen/);
  assert.throws(() => marketParams(d, '0x1'), /treasury/);
});

test('applicationIdFromRequestId takes the first 8 bytes, as ProcessorEndpoint does', () => {
  const rid = '0x00000000000000ff' + '11'.repeat(24);
  assert.equal(applicationIdFromRequestId(rid), 255n);
  assert.throws(() => applicationIdFromRequestId('0x1234'), /requestId/);
});
