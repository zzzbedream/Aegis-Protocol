/**
 * Facts shown on the landing dossier. Addresses come straight from the published deployment file
 * (single source of truth); nothing here is typed by hand except values not stored on-chain.
 */
import deployment from '../../../vela-app/trigger/deployments/2651420.json';

export const REPO = 'https://github.com/zzzbedream/Aegis-Protocol';
export const EXPLORER = 'https://explorer-testnet.horizen.io';

export const links = {
  repo: REPO,
  ci: `${REPO}/actions/workflows/ci.yml`,
  adr: `${REPO}/blob/main/docs/ADR-001-vela-native.md`,
  demo: `${REPO}/blob/main/docs/DEMO.md`,
  runbook: `${REPO}/blob/main/ops/README.md`,
  gasFaucet: 'https://hub-testnet.horizen.io/',
};

export const addressUrl = (a) => `${EXPLORER}/address/${a}`;
export const short = (a, head = 6, tail = 4) => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : '');

export const deployed = {
  chainId: deployment.chainId,
  applicationId: deployment.applicationId,
  deployBlock: deployment.deployBlock,
  wasmSha256: deployment.wasmSha256,
  deployedOn: '30.09.2026',
  // Executor signing key registered in NoAttestationTeeAuthenticator (see docs/DEMO.md).
  executorSigner: '0x47Bd375A17eEe8A3Bea728905717f431B0Bf34d3',
};

export const contracts = [
  { name: 'ProcessorEndpoint', role: 'Vela custody & request queue', address: deployment.processorEndpoint },
  { name: 'NoAttestationTeeAuthenticator', role: 'Checks the executor signature (no Nitro in the demo)', address: deployment.teeAuthenticator },
  { name: 'TokenAllowlist', role: 'Tokens Vela accepts', address: deployment.tokenAllowlist },
  { name: 'AegisPriceTrigger', role: 'Delivers prices to the enclave (TRUSTPROCESS)', address: deployment.trigger },
  { name: 'DemoPriceFeed', role: 'Keeper-published ZEN/USD', address: deployment.priceFeed },
  { name: 'aUSDC', role: 'Test debt token · 6 decimals', address: deployment.usdc },
  { name: 'tZEN', role: 'Test collateral · 18 decimals', address: deployment.zen },
];

export const priceFeedAddress = deployment.priceFeed;
