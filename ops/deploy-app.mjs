/**
 * Deploys aegis_lending.wasm to the (self-operated) Vela environment, wired to AegisPriceTrigger.
 *
 *   1. POST the WASM to the authority service (/deploy/upload) → artifact sha256
 *   2. ProcessorEndpoint.submitDeployRequestWithTrigger(descriptor, trigger)
 *   3. wait for the executor's stateUpdate, then record applicationId in the deployment file
 *
 * Env: CHAIN_ID, RPC_URL, DEPLOYER_PRIVATE_KEY (DEPLOYER_ROLE), AUTHORITY_URL,
 *      optional WASM (default ../vela-app/production_build/aegis_lending.wasm), MAX_FEE_WEI, FORCE=1.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBytes } from 'ethers';
import { requireEnv, loadDeployment, saveDeployment } from './lib/env.mjs';
import { marketParams, applicationIdFromRequestId } from './lib/market.mjs';
import { vela, makeSigner, makeClient, recentFloor } from './lib/vela.mjs';

const DEFAULT_WASM = join(import.meta.dirname, '..', 'vela-app', 'production_build', 'aegis_lending.wasm');
const COMPLETION_TIMEOUT_MS = 600_000;
const POLL_MS = 5000;

async function upload(authorityUrl, wasm) {
  const form = new FormData();
  form.append('wasm', new Blob([wasm]), 'aegis_lending.wasm');
  const res = await fetch(`${authorityUrl.replace(/\/$/, '')}/deploy/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function waitDeployed(client, applicationId, requestId) {
  const oldest = await recentFloor(client);
  const deadline = Date.now() + COMPLETION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await client.getDeployRequestCompletedEvent(applicationId, requestId, undefined, oldest);
    if (res) return res;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error('timed out waiting for the deploy to complete (is the manager running?)');
}

async function main(env) {
  const deployment = loadDeployment(Number(requireEnv(env, 'CHAIN_ID')));
  if (deployment.applicationId && env.FORCE !== '1') {
    throw new Error(`already deployed as application ${deployment.applicationId} (set FORCE=1 to deploy again)`);
  }
  const signer = makeSigner(requireEnv(env, 'RPC_URL'), requireEnv(env, 'DEPLOYER_PRIVATE_KEY'));
  const client = makeClient(signer, deployment);
  const wasm = readFileSync(env.WASM || DEFAULT_WASM);
  const localSha = createHash('sha256').update(wasm).digest('hex');

  const uploaded = await upload(requireEnv(env, 'AUTHORITY_URL'), wasm);
  if (String(uploaded.wasmSha256).replace(/^0x/, '') !== localSha) {
    throw new Error(`authority service returned sha256 ${uploaded.wasmSha256}, expected ${localSha}`);
  }
  console.log(`uploaded ${wasm.length} bytes, sha256 ${localSha}`);

  const params = marketParams(deployment, await signer.getAddress());
  const receipt = await client.submitDeployRequestWithTriggerAndWaitForRequestId(
    vela.PROTOCOL_VERSION, BigInt(env.MAX_FEE_WEI || '1000000000000000'), getBytes('0x' + localSha),
    params, deployment.trigger,
  );
  const applicationId = applicationIdFromRequestId(receipt.requestId);
  console.log(`deploy request ${receipt.requestId} → application ${applicationId}; waiting for the executor…`);

  const done = await waitDeployed(client, applicationId, receipt.requestId);
  if (Number(done.status) !== 0) throw new Error(`deploy failed in the enclave: ${done.errorMessage}`);
  saveDeployment(deployment, {
    applicationId: applicationId.toString(),
    deployBlock: receipt.transactionReceipt.blockNumber,
    wasmSha256: localSha,
  });
  console.log(`deployed: application ${applicationId} (block ${receipt.transactionReceipt.blockNumber})`);
}

main(process.env).catch((e) => {
  console.error(`deploy-app: ${e.message}`);
  process.exit(1);
});
