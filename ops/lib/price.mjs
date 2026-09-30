/**
 * Price helpers for the demo keeper. All prices are USD with 18 decimals as bigint,
 * the format DemoPriceFeed / AegisPriceTrigger expect. No floats past parsing.
 */

const DECIMALS = 18;
const MAX_SHOCK_PCT = 99;

/** Parses a positive decimal price (string or number) into an 18-decimal bigint, truncating. */
export function toE18(value) {
  if (value === null || value === undefined || value === '') throw new Error(`invalid price: ${value}`);
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`invalid price: ${value}`);
  // Keep plain decimal strings as given; for numbers use the shortest round-trip form
  // ("8.42", not 8.4199999…), expanding exponent notation only when present.
  const shortest = typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? value : String(num);
  const plain = /e/i.test(shortest) ? num.toFixed(DECIMALS) : shortest;
  const [int, frac = ''] = plain.split('.');
  const units = BigInt(int) * 10n ** BigInt(DECIMALS) + BigInt((frac + '0'.repeat(DECIMALS)).slice(0, DECIMALS));
  if (units <= 0n) throw new Error(`invalid price: ${value}`);
  return units;
}

/** Scales `priceE18` by `pct` percent (e.g. -30 → 70 %). Refuses shocks that zero the price. */
export function applyShock(priceE18, pct) {
  if (!Number.isInteger(pct) || pct <= -100 || pct < -MAX_SHOCK_PCT) throw new Error(`invalid shock: ${pct}`);
  return (priceE18 * BigInt(100 + pct)) / 100n;
}

/** Parses a CLI shock like "-30%" or "15" into an integer percentage (0 when absent). */
export function parseShock(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  const m = /^([+-]?\d+)%?$/.exec(String(raw).trim());
  const pct = m ? Number(m[1]) : NaN;
  if (!Number.isInteger(pct) || pct < -MAX_SHOCK_PCT || pct > 1000) throw new Error(`invalid shock: ${raw}`);
  return pct;
}

/** Extracts ZEN/USD from a CoinGecko /simple/price response (id "zencash"). */
export function parseCoinGecko(body) {
  const usd = body?.zencash?.usd;
  if (usd === undefined) throw new Error('ZEN price missing from CoinGecko response');
  return toE18(usd);
}

function field(value, name) {
  if (value === undefined || value === null) throw new Error(`${name}: price missing`);
  return toE18(value);
}

/**
 * Public, key-less ZEN price endpoints. CoinGecko blocks many datacenter IPs and Binance blocks US
 * ones, so no single source is trusted: the keeper publishes the median of those that answer.
 * USDT quotes are treated as USD (sub-cent difference, irrelevant for a demo feed).
 */
export const SOURCES = [
  { name: 'coinbase', url: 'https://api.coinbase.com/v2/prices/ZEN-USD/spot', parse: (b) => field(b?.data?.amount, 'coinbase') },
  { name: 'okx', url: 'https://www.okx.com/api/v5/market/ticker?instId=ZEN-USDT', parse: (b) => field(b?.code === '0' ? b.data?.[0]?.last : undefined, 'okx') },
  { name: 'kucoin', url: 'https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=ZEN-USDT', parse: (b) => field(b?.code === '200000' ? b.data?.price : undefined, 'kucoin') },
  { name: 'coingecko', url: 'https://api.coingecko.com/api/v3/simple/price?ids=zencash&vs_currencies=usd', parse: parseCoinGecko },
];

const MIN_SOURCES = 2;
const TIMEOUT_MS = 10_000;

export function medianE18(values) {
  if (values.length === 0) throw new Error('no price to aggregate');
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2n;
}

async function fetchOne(source, fetchImpl) {
  const res = await fetchImpl(source.url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${source.name} HTTP ${res.status}`);
  return source.parse(await res.json());
}

/**
 * Live ZEN/USD as the median of every source that answers; needs at least two so one bad feed
 * cannot move the demo price alone. Throws otherwise (the keeper then skips the tick).
 */
export async function fetchZenUsd(fetchImpl = fetch) {
  const results = await Promise.allSettled(SOURCES.map((s) => fetchOne(s, fetchImpl)));
  const ok = results.flatMap((r, i) => (r.status === 'fulfilled' ? [{ name: SOURCES[i].name, price: r.value }] : []));
  if (ok.length < MIN_SOURCES) {
    const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message).join('; ');
    throw new Error(`only ${ok.length} of ${SOURCES.length} price sources answered (${errors})`);
  }
  return { price: medianE18(ok.map((s) => s.price)), sources: ok.map((s) => s.name) };
}
