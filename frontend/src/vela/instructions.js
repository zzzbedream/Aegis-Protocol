/**
 * Builders for the aegis_lending guest's PROCESS payloads (see vela-app/README.md).
 * Pure functions, no network: unit-tested in tests/unit/instructions.test.mjs.
 *
 * Format rules enforced by vela-common-go (wasm/types):
 *  - Uint256 must be a JSON string with a lowercase "0x" hex prefix.
 *  - Addresses are 0x-prefixed hex strings (any case).
 */

/** Parses a decimal string ("1234.5") into integer base units for `decimals`. */
export function toBaseUnits(value, decimals) {
  if (typeof value !== 'string') value = String(value);
  const s = value.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('invalid amount');
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) throw new Error(`too many decimals (max ${decimals})`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (units <= 0n) throw new Error('amount must be positive');
  if (units >= 2n ** 256n) throw new Error('amount overflows uint256');
  return units;
}

/** Formats integer base units as a decimal string. */
export function fromBaseUnits(units, decimals) {
  const u = BigInt(units);
  const base = 10n ** BigInt(decimals);
  const whole = u / base;
  const frac = (u % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function toUint256Hex(units) {
  const u = BigInt(units);
  if (u < 0n || u >= 2n ** 256n) throw new Error('out of uint256 range');
  return '0x' + u.toString(16);
}

function address(a) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a || '')) throw new Error('invalid address');
  return a.toLowerCase();
}

const ops = {
  supply: ({ amount }) => ({ type: 'supply', amount: toUint256Hex(amount) }),
  redeem: ({ shares }) => ({ type: 'redeem', shares: toUint256Hex(shares) }),
  add_collateral: ({ token, amount }) => ({ type: 'add_collateral', token: address(token), amount: toUint256Hex(amount) }),
  remove_collateral: ({ token, amount }) => ({ type: 'remove_collateral', token: address(token), amount: toUint256Hex(amount) }),
  borrow: ({ amount }) => ({ type: 'borrow', amount: toUint256Hex(amount) }),
  repay: ({ amount }) => ({ type: 'repay', amount: toUint256Hex(amount) }),
  withdraw: ({ token, amount, to }) => ({ type: 'withdraw', token: address(token), amount: toUint256Hex(amount), to: address(to) }),
  liquidate: ({ token, maxRepay }) => ({ type: 'liquidate', token: address(token), maxRepay: toUint256Hex(maxRepay) }),
  poke: () => ({ type: 'poke' }),
  screen: ({ payload }) => {
    if (!/^0x[0-9a-fA-F]+$/.test(payload || '') || payload.length % 2 !== 0) throw new Error('invalid PureFi payload');
    return { type: 'screen', payload };
  },
};

/** Returns the JSON string sent (encrypted) to the enclave. */
export function buildInstruction(type, params = {}) {
  const build = ops[type];
  if (!build) throw new Error(`unknown instruction ${type}`);
  return JSON.stringify(build(params));
}

/** Parses a decrypted UserEvent emitted by the guest (amounts are hex Uint256). */
export function parseUserEvent(bytesOrString) {
  const text = typeof bytesOrString === 'string' ? bytesOrString : new TextDecoder().decode(bytesOrString);
  const ev = JSON.parse(text);
  const out = { ...ev };
  for (const k of ['amount', 'seized', 'repaid']) {
    if (typeof ev[k] === 'string') out[k] = BigInt(ev[k]);
  }
  return out;
}

/** bytes32("AEGIS.SOLVENCY") as a 0x-hex topic, matching lending.SubtypeSolvency. */
export function asciiSubtype(label) {
  const bytes = new TextEncoder().encode(label);
  if (bytes.length > 32) throw new Error('label too long');
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0');
}

export const SUBTYPE_SOLVENCY = asciiSubtype('AEGIS.SOLVENCY');

/** Parses the public solvency report (lending.SolvencyReport). */
export function parseSolvency(bytes) {
  const r = JSON.parse(new TextDecoder().decode(bytes));
  const big = (v) => (typeof v === 'string' ? BigInt(v) : 0n);
  return {
    totalAssets: big(r.totalAssets),
    cash: big(r.cash),
    totalDebt: big(r.totalDebt),
    reserves: big(r.reserves),
    badDebt: big(r.badDebt),
    liquidatableCount: Number(r.liquidatableCount || 0),
    liquidatableDebt: big(r.liquidatableDebt),
    lastPriceTimestamp: Number(r.lastPriceTimestamp || 0),
    utilizationBps: Number(r.utilizationBps || 0),
    borrowAprBps: Number(r.borrowAprBps || 0),
    collateralTotals: Object.fromEntries(Object.entries(r.collateralTotals || {}).map(([k, v]) => [k, big(v)])),
  };
}
