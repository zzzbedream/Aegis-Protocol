/**
 * Node-side wrapper over @horizen/vela-common-ts for the ops scripts: same flow as the
 * browser client (frontend/src/vela/aegisClient.js), with a private-key wallet.
 */
import * as vela from '@horizen/vela-common-ts';
import { JsonRpcProvider, Wallet, NonceManager } from 'ethers';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInstruction } from '../../frontend/src/vela/instructions.js';
import { recentOldest } from '../../frontend/src/vela/blocks.js';

const POLL_MS = 3000;
const TIMEOUT_MS = 300_000;
const RECENT_SPAN = 20_000;
const STATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.state');

export { vela };

export function makeSigner(rpcUrl, privateKey) {
  return new NonceManager(new Wallet(privateKey, new JsonRpcProvider(rpcUrl)));
}

// VelaClient keeps its signer private; remember each client's provider for block-range queries.
const providers = new WeakMap();

export function makeClient(signer, deployment) {
  const client = new vela.VelaClient(signer, false, deployment.teeAuthenticator, deployment.processorEndpoint);
  providers.set(client, signer.provider);
  return client;
}

/** Oldest block worth scanning for a request sent just now (see frontend/src/vela/blocks.js). */
export async function recentFloor(client) {
  const latest = await providers.get(client).getBlockNumber();
  return recentOldest(latest, RECENT_SPAN);
}

/** Polls until the enclave's stateUpdate for `requestId` lands on-chain. */
export async function waitCompleted(client, requestId, timeoutMs = TIMEOUT_MS) {
  const oldest = await recentFloor(client);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // SDK argument order is (newest, oldest); undefined newest = latest.
    const res = await client.getRequestCompletedEvent(requestId, undefined, oldest);
    if (res) return { requestId, ok: Number(res.status) === 0, error: res.errorMessage || null };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return { requestId, ok: false, error: 'timed out waiting for the enclave' };
}

function keyStatePath(chainId, appId, account) {
  return join(STATE_DIR, `assoc-${chainId}-${appId}-${account.toLowerCase()}`);
}

/** Registers the signer's P-521 key with the app once (ASSOCIATEKEY), remembered in ops/.state. */
export async function ensureKey(client, signer, deployment, maxFeeWei) {
  const account = await signer.getAddress();
  const flag = keyStatePath(deployment.chainId, deployment.applicationId, account);
  if (existsSync(flag)) return;
  const kp = await client.getSignerKeyPair();
  const payload = await vela.buildAssociateKeyPayload(kp.publicKey);
  const receipt = await client.submitRequestAndWaitForRequestId(
    vela.PROTOCOL_VERSION, BigInt(deployment.applicationId), vela.RequestType.ASSOCIATEKEY,
    payload, vela.ETH_TOKEN, 0n, maxFeeWei,
  );
  const res = await waitCompleted(client, receipt.requestId);
  if (!res.ok) throw new Error(`ASSOCIATEKEY failed for ${account}: ${res.error}`);
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(flag, new Date().toISOString());
}

/** Sends an encrypted PROCESS instruction, optionally with an ERC-20 deposit { token, amount }. */
export async function sendProcess(client, deployment, type, params, deposit, maxFeeWei) {
  const payload = await client.encryptForTee(vela.stringToBytes(buildInstruction(type, params)));
  const token = deposit ? deposit.token : vela.ETH_TOKEN;
  const amount = deposit ? deposit.amount : 0n;
  if (deposit) await (await client.approveToken(token, amount)).wait();
  const receipt = await client.submitRequestAndWaitForRequestId(
    vela.PROTOCOL_VERSION, BigInt(deployment.applicationId), vela.RequestType.PROCESS,
    payload, token, amount, maxFeeWei,
  );
  return waitCompleted(client, receipt.requestId);
}
