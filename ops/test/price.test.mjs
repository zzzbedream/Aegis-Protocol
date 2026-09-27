import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toE18, applyShock, parseCoinGecko, parseShock } from '../lib/price.mjs';

test('toE18 converts decimal USD prices exactly, without float drift', () => {
  assert.equal(toE18('10.5'), 10_500000000000000000n);
  assert.equal(toE18(0.1), 100000000000000000n);
  assert.equal(toE18('7.123456789012345678999'), 7_123456789012345678n); // truncates past 18 dp
  assert.equal(toE18('1e-7'), 100000000000n);
});

test('toE18 rejects non-positive and malformed prices', () => {
  for (const bad of ['0', '-1', 'abc', '', NaN, Infinity, null]) {
    assert.throws(() => toE18(bad), /invalid price/);
  }
});

test('applyShock scales by a percentage and never reaches zero', () => {
  assert.equal(applyShock(10n ** 19n, -30), 7n * 10n ** 18n);
  assert.equal(applyShock(10n ** 19n, 0), 10n ** 19n);
  assert.equal(applyShock(10n ** 19n, 50), 15n * 10n ** 18n);
  assert.throws(() => applyShock(10n ** 19n, -100), /shock/);
});

test('parseShock reads "-30%" style CLI values', () => {
  assert.equal(parseShock('-30%'), -30);
  assert.equal(parseShock('15'), 15);
  assert.equal(parseShock(undefined), 0);
  assert.throws(() => parseShock('-150%'), /shock/);
  assert.throws(() => parseShock('abc'), /shock/);
});

test('parseCoinGecko extracts the ZEN price or fails loudly', () => {
  assert.equal(parseCoinGecko({ zencash: { usd: 8.42 } }), 8_420000000000000000n);
  assert.throws(() => parseCoinGecko({}), /ZEN price/);
  assert.throws(() => parseCoinGecko({ zencash: { usd: 0 } }), /invalid price/);
});
