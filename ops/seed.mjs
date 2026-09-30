/**
 * Seeds the demo market so the solvency report shows real activity from minute one:
 *   lender   supplies 50,000 aUSDC
 *   borrower posts 1,000 tZEN as collateral and borrows 65 % of its value at the feed price
 * A -30 % demo shock (keeper SHOCK=-30% ONCE=1) then makes the borrower liquidatable.
 *
 * Env: CHAIN_ID, RPC_URL, DEPLOYER_PRIVATE_KEY (token owner, pays gas top-ups),
 *      SEED_LENDER_KEY, SEED_BORROWER_KEY, optional MAX_FEE_WEI.
 */
import { Contract, keccak256, parseEther, parseUnits, toUtf8Bytes } from 'ethers';
import { requireEnv, loadDeployment } from './lib/env.mjs';
import { borrowForCollateral } from './lib/market.mjs';
import { makeSigner, makeClient, ensureKey, sendProcess } from './lib/vela.mjs';

const TOKEN_ABI = ['function mint(address to, uint256 amount)'];
const FEED_ABI = ['function getTemporalNumericValueV1(bytes32 id) view returns (uint64, int192)'];
// Horizen testnet gas is ~0.001 gwei: 0.0003 ETH covers thousands of requests per account.
const GAS_TOP_UP = parseEther('0.0003');
const BORROW_RATIO_BPS = 6500n;

async function prepare(admin, signer, token, amount) {
  const to = await signer.getAddress();
  await (await admin.sendTransaction({ to, value: GAS_TOP_UP })).wait();
  await (await new Contract(token, TOKEN_ABI, admin).mint(to, amount)).wait();
  return to;
}

/**
 * Borrows 65 % of the collateral value at the current feed price: inside the 75 % LTV, and
 * liquidatable after a -30 % shock (0.65 > 0.7 × 80 % threshold).
 */
async function borrowAmount(provider, deployment, collateralWei) {
  const feed = new Contract(deployment.priceFeed, FEED_ABI, provider);
  const [, zenE18] = await feed.getTemporalNumericValueV1(keccak256(toUtf8Bytes('ZENUSD')));
  return borrowForCollateral(collateralWei, BigInt(zenE18), BORROW_RATIO_BPS);
}

function check(step, res) {
  if (!res.ok) throw new Error(`${step} failed: ${res.error}`);
  console.log(`${step}: ok (${res.requestId})`);
}

async function main(env) {
  const deployment = loadDeployment(Number(requireEnv(env, 'CHAIN_ID')), { needApp: true });
  const rpc = requireEnv(env, 'RPC_URL');
  const maxFee = BigInt(env.MAX_FEE_WEI || '100000000000000');
  const admin = makeSigner(rpc, requireEnv(env, 'DEPLOYER_PRIVATE_KEY'));

  const lender = makeSigner(rpc, requireEnv(env, 'SEED_LENDER_KEY'));
  const supply = parseUnits('50000', 6);
  await prepare(admin, lender, deployment.usdc, supply);
  const lc = makeClient(lender, deployment);
  await ensureKey(lc, lender, deployment, maxFee);
  check('lender supply', await sendProcess(lc, deployment, 'supply', { amount: supply },
    { token: deployment.usdc, amount: supply }, maxFee));

  const borrower = makeSigner(rpc, requireEnv(env, 'SEED_BORROWER_KEY'));
  const collateral = parseUnits('1000', 18);
  await prepare(admin, borrower, deployment.zen, collateral);
  const bc = makeClient(borrower, deployment);
  await ensureKey(bc, borrower, deployment, maxFee);
  check('borrower collateral', await sendProcess(bc, deployment, 'add_collateral',
    { token: deployment.zen, amount: collateral }, { token: deployment.zen, amount: collateral }, maxFee));
  const borrow = await borrowAmount(admin, deployment, collateral);
  check('borrower borrow', await sendProcess(bc, deployment, 'borrow', { amount: borrow }, undefined, maxFee));
}

main(process.env).catch((e) => {
  console.error(`seed: ${e.message}`);
  process.exit(1);
});
