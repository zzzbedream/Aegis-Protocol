import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solvencyView } from '../../src/vela/solvency.js';

const cfg = {
  assets: {
    debt: { symbol: 'USDC', address: '0xaaaa000000000000000000000000000000000001', decimals: 6 },
    collateral: [{ symbol: 'ZEN', address: '0x0D6a47E910E65b9f9c00025112e22b94Ff9211a0', decimals: 18 }],
  },
};

// The live report read from Horizen testnet on 2026-09-30 after seeding the demo market.
const live = {
  totalAssets: 50_000_000_000n,
  cash: 45_481_850_000n,
  totalDebt: 4_518_150_000n,
  reserves: 0n,
  badDebt: 0n,
  liquidatableCount: 0,
  liquidatableDebt: 0n,
  lastPriceTimestamp: 1790732033,
  utilizationBps: 903,
  borrowAprBps: 290,
  collateralTotals: { '0x0d6a47e910e65b9f9c00025112e22b94ff9211a0': 1000n * 10n ** 18n },
};

test('solvencyView formats the public aggregates for display', () => {
  const v = solvencyView(live, cfg, 1790732093);
  assert.equal(v.supplied, '50000 USDC');
  assert.equal(v.borrowed, '4518.15 USDC');
  assert.equal(v.available, '45481.85 USDC');
  assert.equal(v.utilization, '9.03%');
  assert.equal(v.borrowApr, '2.90%');
  assert.deepEqual(v.collateral, ['1000 ZEN']);
  assert.equal(v.liquidatable, '0 positions');
  assert.equal(v.priceAge, '1 min ago');
});

test('solvencyView flags liquidatable positions and bad debt', () => {
  const v = solvencyView({ ...live, liquidatableCount: 1, liquidatableDebt: 4_518_150_000n, badDebt: 5_000_000n }, cfg, 1790732033 + 7200);
  assert.equal(v.liquidatable, '1 position · 4518.15 USDC of debt');
  assert.equal(v.badDebt, '5 USDC');
  assert.equal(v.priceAge, '2 h ago');
});

test('solvencyView keeps unknown collateral tokens visible (raw units)', () => {
  const v = solvencyView({ ...live, collateralTotals: { '0xbeef000000000000000000000000000000000000': 7n } }, cfg, 1790732033);
  assert.deepEqual(v.collateral, ['7 (0xbeef…0000)']);
});
