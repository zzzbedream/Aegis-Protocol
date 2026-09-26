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

export const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=zencash&vs_currencies=usd';

/** Fetches the live ZEN/USD price. Throws on HTTP or format errors (the keeper then skips the tick). */
export async function fetchZenUsd(fetchImpl = fetch) {
  const res = await fetchImpl(COINGECKO_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
  return parseCoinGecko(await res.json());
}
