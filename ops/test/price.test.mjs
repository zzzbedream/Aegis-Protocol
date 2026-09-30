import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toE18, applyShock, parseCoinGecko, parseShock, SOURCES, medianE18, fetchZenUsd } from '../lib/price.mjs';

const byName = Object.fromEntries(SOURCES.map((s) => [s.name, s]));

test('each exchange parser reads its real response shape', () => {
  assert.equal(byName.coinbase.parse({ data: { amount: '6.948', base: 'ZEN', currency: 'USD' } }), 6_948000000000000000n);
  assert.equal(byName.okx.parse({ code: '0', data: [{ instId: 'ZEN-USDT', last: '6.989' }] }), 6_989000000000000000n);
  assert.equal(byName.kucoin.parse({ code: '200000', data: { price: '6.969' } }), 6_969000000000000000n);
  assert.equal(byName.coingecko.parse({ zencash: { usd: 7.01 } }), 7_010000000000000000n);
  assert.throws(() => byName.okx.parse({ code: '51001', data: [] }), /price/);
  assert.throws(() => byName.kucoin.parse({ code: '400100', data: null }), /price/);
});

test('medianE18 takes the middle value (mean of the two middles when even)', () => {
  assert.equal(medianE18([3n, 1n, 2n]), 2n);
  assert.equal(medianE18([4n, 1n, 3n, 2n]), 2n); // (2 + 3) / 2, truncated
  assert.throws(() => medianE18([]), /no price/);
});

function fakeFetch(responses) {
  return async (url) => {
    const hit = Object.entries(responses).find(([k]) => url.includes(k));
    if (!hit || hit[1] === 'down') return { ok: false, status: 403, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => hit[1] };
  };
}

test('fetchZenUsd returns the median of the sources that answer', async () => {
  const res = await fetchZenUsd(fakeFetch({
    coinbase: { data: { amount: '6.90' } },
    okx: { code: '0', data: [{ last: '7.00' }] },
    kucoin: { code: '200000', data: { price: '100' } }, // outlier: ignored by the median
    coingecko: 'down',
  }));
  assert.equal(res.price, 7_000000000000000000n);
  assert.deepEqual(res.sources.sort(), ['coinbase', 'kucoin', 'okx']);
});

test('fetchZenUsd refuses to publish with fewer than 2 sources', async () => {
  await assert.rejects(
    fetchZenUsd(fakeFetch({ coinbase: { data: { amount: '6.9' } }, okx: 'down', kucoin: 'down', coingecko: 'down' })),
    /only 1 of 4 price sources/,
  );
});

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
