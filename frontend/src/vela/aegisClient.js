/**
 * Thin wrapper over the official Vela TypeScript client (@horizen/vela-common-ts 0.2.0).
 * The library (and ethers) are loaded lazily on connect to keep the first page load small.
 *
 * Flow for every PROCESS request:
 *   JSON instruction -> encryptForTee (P-521 ECDH + HKDF + AES-256-GCM, key derived from a
 *   wallet signature) -> ProcessorEndpoint.submitRequest (optionally with an ERC-20 deposit)
 *   -> wait for RequestCompleted (the signed stateUpdate) and report COMPLETED / FAILED.
 */
import { buildInstruction, parseUserEvent, parseSolvency, SUBTYPE_SOLVENCY } from './instructions.js';
import { blockWindows, recentOldest, MAX_LOG_SPAN } from './blocks.js';

const POLL_MS = 2000;
const TIMEOUT_MS = 180000;
// A request we just sent completes within minutes; ~5.5 h of 1 s blocks is plenty.
const RECENT_SPAN = 20_000;
// Event history scan depth: 10 windows of MAX_LOG_SPAN ≈ 11 days on Horizen testnet.
const MAX_HISTORY_WINDOWS = 10;

function keyFlag(account, appId) {
  return `aegis:assoc:${appId}:${account.toLowerCase()}`;
}

function readFlag(k) {
  try {
    return window.localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}

function writeFlag(k) {
  try {
    window.localStorage.setItem(k, '1');
  } catch {
    /* non-essential */
  }
}

export async function connectAegis(cfg) {
  const vela = await import('@horizen/vela-common-ts');
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No browser wallet found (install MetaMask or another EIP-1193 wallet).');
  }
  const signer = await vela.ethersSignerFromBrowser();
  const account = await signer.getAddress();
  if (cfg.chainId) {
    const net = await signer.provider.getNetwork();
    if (Number(net.chainId) !== cfg.chainId) {
      throw new Error(`Wrong network: wallet is on chain ${net.chainId}, expected ${cfg.chainId}.`);
    }
  }
  const client = new vela.VelaClient(signer, false, cfg.teeAuthenticator, cfg.processorEndpoint);
  const appId = cfg.applicationId;
  const floor = cfg.deployBlock ?? 0;
  const latestBlock = () => signer.provider.getBlockNumber();

  // SDK argument order is (newest, oldest); `undefined` newest means "latest".
  async function waitCompleted(requestId) {
    const oldest = recentOldest(await latestBlock(), RECENT_SPAN, floor);
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await client.getRequestCompletedEvent(requestId, undefined, oldest);
      if (res) {
        // RequestResult: status 0 = COMPLETED, 1 = FAILED (Structs.RequestResult).
        return { requestId, ok: Number(res.status) === 0, error: res.errorMessage || null, fee: res.applicationFees };
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return { requestId, ok: false, error: 'Timed out waiting for the enclave to process the request.' };
  }

  return {
    account,
    isKeyRegistered: () => readFlag(keyFlag(account, appId)),

    /** ASSOCIATEKEY: registers the wallet-derived P-521 key so the enclave can decrypt our
     *  payloads and encrypt our events. The payload is the public key (plaintext by design). */
    async registerKey() {
      const kp = await client.getSignerKeyPair();
      const payload = await vela.buildAssociateKeyPayload(kp.publicKey);
      const receipt = await client.submitRequestAndWaitForRequestId(
        vela.PROTOCOL_VERSION, appId, vela.RequestType.ASSOCIATEKEY, payload, vela.ETH_TOKEN, 0n, cfg.maxFeeWei,
      );
      const res = await waitCompleted(receipt.requestId);
      if (res.ok) writeFlag(keyFlag(account, appId));
      return res;
    },

    /** Encrypted PROCESS request; `deposit` = { token, amount } attaches an ERC-20 deposit. */
    async process(type, params, deposit) {
      const json = buildInstruction(type, params);
      const payload = await client.encryptForTee(vela.stringToBytes(json));
      const token = deposit ? deposit.token : vela.ETH_TOKEN;
      const amount = deposit ? deposit.amount : 0n;
      if (deposit) {
        const tx = await client.approveToken(token, amount);
        await tx.wait();
      }
      const receipt = await client.submitRequestAndWaitForRequestId(
        vela.PROTOCOL_VERSION, appId, vela.RequestType.PROCESS, payload, token, amount, cfg.maxFeeWei,
      );
      return waitCompleted(receipt.requestId);
    },

    async pendingClaims(token) {
      return client.getPendingClaims(token, account);
    },

    async claim(token) {
      const tx = await client.claim(token, account);
      await tx.wait();
    },

    /** Our own events, decrypted locally with the wallet-derived P-521 key. */
    async myEvents() {
      const latest = await latestBlock();
      const earliest = cfg.deployBlock ?? recentOldest(latest, MAX_LOG_SPAN);
      const windows = blockWindows(latest, earliest, MAX_LOG_SPAN, MAX_HISTORY_WINDOWS);
      const chunks = [];
      for (const [newest, oldest] of windows) {
        chunks.unshift(await client.getCurrentUserEvents(newest, oldest, appId, undefined, undefined, () => true, false));
      }
      return chunks.flat().map((b) => {
        try {
          return parseUserEvent(b);
        } catch {
          return { type: 'undecodable' };
        }
      });
    },

    /** Latest public solvency report (AppEvent AEGIS.SOLVENCY), or null. */
    async latestSolvency() {
      const oldest = recentOldest(await latestBlock(), MAX_LOG_SPAN, floor);
      const evs = await client.getAppEvents(undefined, oldest, appId, undefined, SUBTYPE_SOLVENCY);
      if (!evs.length) return null;
      return parseSolvency(evs[evs.length - 1].data);
    },

    teePublicKey: () => client.getTeePublicKey(),
  };
}
