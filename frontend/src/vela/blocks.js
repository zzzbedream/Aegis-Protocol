/**
 * Block-range helpers for event queries. Public RPCs cap eth_getLogs ranges (Horizen testnet:
 * 100,000 blocks, ~27 h at 1 block/s), and @horizen/vela-common-ts 0.2.0 queries from block 0
 * unless told otherwise. Note the SDK's inverted naming: its `fromBlock` is the NEWEST block and
 * `toBlock` the OLDEST, so callers pass (newest, oldest).
 */

export const MAX_LOG_SPAN = 99_000;

/** Oldest block of a recent window of `span` blocks, never below `floor` (e.g. the deploy block). */
export function recentOldest(latest, span, floor = 0) {
  return Math.max(latest - span, floor, 0);
}

/** Newest-first [newest, oldest] windows covering [earliest, latest], at most `maxWindows`. */
export function blockWindows(latest, earliest, span = MAX_LOG_SPAN, maxWindows = Infinity) {
  const windows = [];
  for (let newest = latest; newest >= earliest && windows.length < maxWindows; newest -= span) {
    windows.push([newest, Math.max(newest - span + 1, earliest)]);
  }
  return windows;
}
