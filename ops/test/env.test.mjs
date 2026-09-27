import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireEnv, validateDeployment } from '../lib/env.mjs';

test('requireEnv returns the value or names every missing variable', () => {
  assert.equal(requireEnv({ A: 'x' }, 'A'), 'x');
  assert.throws(() => requireEnv({ A: '' }, 'A'), /Missing environment variable A/);
});

const good = {
  chainId: 2651420,
  processorEndpoint: '0x' + '1'.repeat(40),
  teeAuthenticator: '0x' + '8'.repeat(40),
  tokenAllowlist: '0x' + '2'.repeat(40),
  usdc: '0x' + '3'.repeat(40),
  zen: '0x' + '4'.repeat(40),
  priceFeed: '0x' + '5'.repeat(40),
  keeper: '0x' + '6'.repeat(40),
  trigger: '0x' + '7'.repeat(40),
};

test('validateDeployment accepts a complete deployment file', () => {
  assert.deepEqual(validateDeployment(good), good);
});

test('validateDeployment rejects missing or malformed addresses', () => {
  assert.throws(() => validateDeployment({ ...good, trigger: undefined }), /trigger/);
  assert.throws(() => validateDeployment({ ...good, zen: '0x123' }), /zen/);
  assert.throws(() => validateDeployment({ ...good, chainId: 'x' }), /chainId/);
});

test('validateDeployment optionally requires the application id', () => {
  assert.throws(() => validateDeployment(good, { needApp: true }), /applicationId/);
  const withApp = { ...good, applicationId: '42', deployBlock: 100 };
  assert.equal(validateDeployment(withApp, { needApp: true }).applicationId, '42');
});
