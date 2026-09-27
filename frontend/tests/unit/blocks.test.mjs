import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockWindows, recentOldest, MAX_LOG_SPAN } from '../../src/vela/blocks.js';

// Horizen testnet's RPC rejects eth_getLogs ranges over 100,000 blocks (~27 h at 1 block/s).

test('blockWindows splits [earliest, latest] into newest-first windows within the RPC limit', () => {
  assert.deepEqual(blockWindows(250, 0, 100), [[250, 151], [150, 51], [50, 0]]);
  for (const [newest, oldest] of blockWindows(28_877_102, 28_500_000, MAX_LOG_SPAN)) {
    assert.ok(newest - oldest + 1 <= MAX_LOG_SPAN);
  }
});

test('blockWindows caps the number of windows and handles empty ranges', () => {
  assert.equal(blockWindows(1_000_000, 0, 1000, 3).length, 3);
  assert.deepEqual(blockWindows(10, 20, 100), []);
});

test('recentOldest never goes below the deploy block or zero', () => {
  assert.equal(recentOldest(1_000_000, 20_000), 980_000);
  assert.equal(recentOldest(1_000_000, 20_000, 990_000), 990_000);
  assert.equal(recentOldest(500, 20_000), 0);
});

test('the SDK scan span stays under the RPC limit', () => {
  assert.ok(MAX_LOG_SPAN < 100_000);
});
