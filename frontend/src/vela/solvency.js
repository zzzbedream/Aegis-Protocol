/**
 * Public solvency report: display formatting (pure) and a wallet-less reader. The report is an
 * AppEvent the enclave publishes on every `poke` with aggregates only — never identities.
 */
import { fromBaseUnits, parseSolvency, SUBTYPE_SOLVENCY } from './instructions.js';
import { recentOldest, MAX_LOG_SPAN } from './blocks.js';

const pct = (bps) => `${(bps / 100).toFixed(2)}%`;

function age(seconds) {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

function collateralLine(address, units, cfg) {
  const token = cfg.assets.collateral.find((c) => c.address?.toLowerCase() === address.toLowerCase());
  if (token) return `${fromBaseUnits(units, token.decimals)} ${token.symbol}`;
  return `${units} (${address.slice(0, 6)}…${address.slice(-4)})`;
}

/** Human-readable view of a parsed solvency report; `nowSeconds` makes it deterministic in tests. */
export function solvencyView(report, cfg, nowSeconds = Math.floor(Date.now() / 1000)) {
  const debt = cfg.assets.debt;
  const usd = (units) => `${fromBaseUnits(units, debt.decimals)} ${debt.symbol}`;
  const n = report.liquidatableCount;
  const liquidatable = n === 0
    ? '0 positions'
    : `${n} position${n === 1 ? '' : 's'} · ${usd(report.liquidatableDebt)} of debt`;
  return {
    supplied: usd(report.totalAssets),
    borrowed: usd(report.totalDebt),
    available: usd(report.cash),
    utilization: pct(report.utilizationBps),
    borrowApr: pct(report.borrowAprBps),
    collateral: Object.entries(report.collateralTotals).map(([a, u]) => collateralLine(a, u, cfg)),
    liquidatable,
    badDebt: usd(report.badDebt),
    priceAge: age(nowSeconds - report.lastPriceTimestamp),
  };
}

/** USD price with 18 decimals (Stork/DemoPriceFeed format) as a 4-decimal string, truncated. */
export function formatUsdE18(value) {
  const v = BigInt(value);
  const whole = v / 10n ** 18n;
  const frac = ((v % 10n ** 18n) / 10n ** 14n).toString().padStart(4, '0');
  return `${whole}.${frac}`;
}

const FEED_ABI = ['function getTemporalNumericValueV1(bytes32 id) view returns ((uint64 timestampNs, int192 quantizedValue))'];

/** Live ZEN/USD from the on-chain feed the enclave consumes: { price, updatedAt } (seconds). */
export async function readZenPrice(cfg, feedAddress) {
  if (!cfg.rpcUrl) throw new Error('no public RPC configured (VITE_RPC_URL)');
  const { JsonRpcProvider, Contract, id } = await import('ethers');
  const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId ?? undefined, { staticNetwork: true });
  const v = await new Contract(feedAddress, FEED_ABI, provider).getTemporalNumericValueV1(id('ZENUSD'));
  return { price: formatUsdE18(v.quantizedValue), updatedAt: Number(v.timestampNs / 1_000_000_000n) };
}

/**
 * Reads the latest public report without a wallet: read-only RPC provider plus a throwaway,
 * never-funded key (VelaClient requires a signer even for event queries).
 */
export async function readPublicSolvency(cfg) {
  if (!cfg.rpcUrl) throw new Error('no public RPC configured (VITE_RPC_URL)');
  const [vela, { JsonRpcProvider, Wallet }] = await Promise.all([import('@horizen/vela-common-ts'), import('ethers')]);
  const provider = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId ?? undefined, { staticNetwork: true });
  const reader = Wallet.createRandom().connect(provider);
  const client = new vela.VelaClient(reader, false, cfg.teeAuthenticator, cfg.processorEndpoint);
  const oldest = recentOldest(await provider.getBlockNumber(), MAX_LOG_SPAN, cfg.deployBlock ?? 0);
  // SDK argument order is (newest, oldest).
  const events = await client.getAppEvents(undefined, oldest, cfg.applicationId, undefined, SUBTYPE_SOLVENCY);
  return events.length ? parseSolvency(events[events.length - 1].data) : null;
}
