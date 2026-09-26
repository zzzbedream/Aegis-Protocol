// Run with: node --test tests/unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildInstruction, toBaseUnits, fromBaseUnits, toUint256Hex, parseUserEvent, asciiSubtype, SUBTYPE_SOLVENCY, parseSolvency,
} from '../../src/vela/instructions.js';

const ZEN = '0x00000000000000000000000000000000000000A1';
const SINK = '0x5000000000000000000000000000000000000005';

// Shared contract with the Go guest: vela-app/lending/frontend_contract_test.go decodes and
// executes these exact strings. Changing the builder output must break one of the two tests.
test('builder output matches the cross-language fixture', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../vela-app/lending/testdata/frontend_instructions.json', import.meta.url)));
  const built = {
    supply: buildInstruction('supply', { amount: toBaseUnits('100000', 6) }),
    add_collateral: buildInstruction('add_collateral', { token: ZEN, amount: toBaseUnits('1000', 18) }),
    borrow: buildInstruction('borrow', { amount: toBaseUnits('7000', 6) }),
    repay: buildInstruction('repay', { amount: toBaseUnits('0.5', 6) }),
    withdraw: buildInstruction('withdraw', { token: ZEN, amount: toBaseUnits('1.25', 18), to: SINK }),
    liquidate: buildInstruction('liquidate', { token: ZEN, maxRepay: toBaseUnits('10000', 6) }),
    poke: buildInstruction('poke'),
  };
  assert.deepEqual(built, fixture);
});

test('toBaseUnits parses exactly and rejects bad input', () => {
  assert.equal(toBaseUnits('1', 18), 10n ** 18n);
  assert.equal(toBaseUnits('0.000001', 6), 1n);
  assert.equal(toBaseUnits('123.45', 6), 123450000n);
  for (const bad of ['', '-1', '1e3', 'abc', '0', '0.0', '1.0000001']) {
    assert.throws(() => toBaseUnits(bad, 6), `${bad} must be rejected`);
  }
  assert.throws(() => toBaseUnits('1' + '0'.repeat(78), 0), /overflow/);
});

test('fromBaseUnits round-trips', () => {
  for (const [s, d] of [['1', 18], ['0.5', 6], ['123.456789', 6], ['1000000', 6]]) {
    assert.equal(fromBaseUnits(toBaseUnits(s, d), d), s);
  }
});

test('Uint256 hex is lowercase 0x (required by vela-common-go)', () => {
  assert.equal(toUint256Hex(255n), '0xff');
  assert.throws(() => toUint256Hex(-1n));
  assert.throws(() => toUint256Hex(2n ** 256n));
});

test('invalid instructions are rejected before anything is sent', () => {
  assert.throws(() => buildInstruction('steal'), /unknown/);
  assert.throws(() => buildInstruction('withdraw', { token: ZEN, amount: 1n, to: '0x123' }), /address/);
  assert.throws(() => buildInstruction('screen', { payload: '0xabc' }), /PureFi/);
});

test('guest events and solvency reports decode', () => {
  const ev = parseUserEvent('{"type":"liquidation_executed","token":"0xa1","seized":"0x10","repaid":"0x20","nonce":7}');
  assert.equal(ev.seized, 16n);
  assert.equal(ev.repaid, 32n);
  assert.equal(SUBTYPE_SOLVENCY, asciiSubtype('AEGIS.SOLVENCY'));
  assert.equal(SUBTYPE_SOLVENCY, '0x' + Buffer.from('AEGIS.SOLVENCY').toString('hex').padEnd(64, '0'));
  const r = parseSolvency(new TextEncoder().encode('{"totalAssets":"0x64","cash":"0x10","totalDebt":"0x54","reserves":"0x0","badDebt":"0x0","liquidatableCount":1,"liquidatableDebt":"0x5","lastPriceTimestamp":9,"collateralTotals":{"0xa1":"0x3"}}'));
  assert.equal(r.totalAssets, 100n);
  assert.equal(r.liquidatableCount, 1);
  assert.equal(r.collateralTotals['0xa1'], 3n);
});
