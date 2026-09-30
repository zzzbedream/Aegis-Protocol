/**
 * Demo price keeper. Every INTERVAL_SEC:
 *   live ZEN/USD (median of Coinbase, OKX, KuCoin, CoinGecko) → optional demo shock → DemoPriceFeed.setPrices → encrypted `poke`,
 * which makes AegisPriceTrigger deliver fresh prices to the enclave (TRUSTPROCESS) and the guest
 * publish its solvency report.
 *
 * Env: CHAIN_ID, RPC_URL, KEEPER_PRIVATE_KEY, optional INTERVAL_SEC (300), SHOCK ("-30%"),
 *      MAX_FEE_WEI, ONCE=1 (single tick, e.g. to trigger a liquidation demo).
 */
import { Contract, keccak256, toUtf8Bytes } from 'ethers';
import { requireEnv, loadDeployment } from './lib/env.mjs';
import { fetchZenUsd, applyShock, parseShock } from './lib/price.mjs';
import { makeSigner, makeClient, ensureKey, sendProcess } from './lib/vela.mjs';

const FEED_ABI = ['function setPrices(bytes32[] ids, int192[] values)'];
const USDC_FEED = keccak256(toUtf8Bytes('USDCUSD'));
const ZEN_FEED = keccak256(toUtf8Bytes('ZENUSD'));
const ONE_USD = 10n ** 18n;

function log(msg) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

async function tick(ctx) {
  const { price: live, sources } = await fetchZenUsd();
  const zen = applyShock(live, ctx.shock);
  const tx = await ctx.feed.setPrices([USDC_FEED, ZEN_FEED], [ONE_USD, zen]);
  await tx.wait();
  const label = ctx.shock ? ` (live ${live}, DEMO SHOCK ${ctx.shock}%)` : '';
  log(`ZEN/USD ${zen}${label} [median of ${sources.join(', ')}] published in ${tx.hash}`);
  const res = await sendProcess(ctx.client, ctx.deployment, 'poke', {}, undefined, ctx.maxFee);
  log(res.ok ? `poke completed (${res.requestId})` : `poke FAILED: ${res.error}`);
}

async function main(env) {
  const deployment = loadDeployment(Number(requireEnv(env, 'CHAIN_ID')), { needApp: true });
  const signer = makeSigner(requireEnv(env, 'RPC_URL'), requireEnv(env, 'KEEPER_PRIVATE_KEY'));
  const account = await signer.getAddress();
  if (account.toLowerCase() !== deployment.keeper.toLowerCase()) {
    throw new Error(`KEEPER_PRIVATE_KEY is ${account}, but the feed keeper is ${deployment.keeper}`);
  }
  const ctx = {
    deployment,
    client: makeClient(signer, deployment),
    feed: new Contract(deployment.priceFeed, FEED_ABI, signer),
    shock: parseShock(env.SHOCK),
    maxFee: BigInt(env.MAX_FEE_WEI || '100000000000000'),
  };
  await ensureKey(ctx.client, signer, deployment, ctx.maxFee);

  const intervalMs = Number(env.INTERVAL_SEC || 300) * 1000;
  for (;;) {
    try {
      await tick(ctx);
    } catch (e) {
      // A failed tick (API down, RPC hiccup) is retried next interval; prices age meanwhile.
      log(`tick failed: ${e.shortMessage || e.message}`);
      // The NonceManager caches the nonce and never recovers on its own if a tx is dropped or the
      // key is used elsewhere ("nonce too low"): re-read it from the chain before the next tick.
      signer.reset();
      if (env.ONCE === '1') process.exitCode = 1;
    }
    if (env.ONCE === '1') return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main(process.env).catch((e) => {
  console.error(`keeper: ${e.message}`);
  process.exit(1);
});
