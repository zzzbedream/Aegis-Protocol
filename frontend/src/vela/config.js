/**
 * Deployment configuration, injected at build time through Vite env variables.
 * Nothing here is invented: when a value is missing the UI stays in "not configured"
 * mode and every action is disabled.
 */
const env = import.meta.env ?? {};

function addr(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : null;
}

// The demo market uses worthless test tokens; label them by their on-chain symbols.
const isDemo = env.VITE_DEMO_OPERATOR === 'true';

export const VELA_CONFIG = {
  networkName: env.VITE_NETWORK_NAME || 'Vela (Base Sepolia, early access)',
  chainId: env.VITE_CHAIN_ID ? Number(env.VITE_CHAIN_ID) : null,
  processorEndpoint: addr(env.VITE_VELA_PROCESSOR_ENDPOINT),
  teeAuthenticator: addr(env.VITE_VELA_TEE_AUTHENTICATOR),
  applicationId: env.VITE_AEGIS_APP_ID ? BigInt(env.VITE_AEGIS_APP_ID) : null,
  // Block of the app deployment: lower bound for event scans (RPCs cap eth_getLogs ranges).
  deployBlock: /^\d+$/.test(env.VITE_DEPLOY_BLOCK || '') ? Number(env.VITE_DEPLOY_BLOCK) : null,
  // Used to add the chain to the wallet (EIP-3085) and to link transactions.
  rpcUrl: env.VITE_RPC_URL || null,
  explorerUrl: env.VITE_EXPLORER_URL || null,
  // Self-operated testnet demo: executor without Nitro attestation, demo price feed, test tokens.
  demo: {
    operator: isDemo,
    faucet: env.VITE_DEMO_FAUCET === 'true',
  },
  // Max fee (wei, paid in ETH) attached to each request; refunded if unused.
  maxFeeWei: BigInt(env.VITE_MAX_FEE_WEI || '100000000000000'),
  assets: {
    debt: { symbol: isDemo ? 'aUSDC' : 'USDC', address: addr(env.VITE_USDC_ADDRESS), decimals: 6 },
    collateral: [{ symbol: isDemo ? 'tZEN' : 'ZEN', address: addr(env.VITE_ZEN_ADDRESS), decimals: 18 }],
  },
};

// Evidence shown while the app cannot run on a live network. The video link is optional.
const REPO_URL = 'https://github.com/zzzbedream/Aegis-Protocol';

export const EVIDENCE_LINKS = [
  env.VITE_DEMO_VIDEO_URL && { label: 'Demo video', href: env.VITE_DEMO_VIDEO_URL },
  { label: 'E2E on the official Vela v0.2.0 harness (CI)', href: `${REPO_URL}/actions/workflows/ci.yml` },
  { label: 'Architecture & threat model (ADR-001)', href: `${REPO_URL}/blob/main/docs/ADR-001-vela-native.md` },
  { label: 'Source code', href: REPO_URL },
].filter(Boolean);

export function missingConfig(cfg = VELA_CONFIG) {
  const missing = [];
  if (!cfg.processorEndpoint) missing.push('VITE_VELA_PROCESSOR_ENDPOINT');
  if (!cfg.teeAuthenticator) missing.push('VITE_VELA_TEE_AUTHENTICATOR');
  if (cfg.applicationId === null) missing.push('VITE_AEGIS_APP_ID');
  if (!cfg.assets.debt.address) missing.push('VITE_USDC_ADDRESS');
  if (!cfg.assets.collateral[0].address) missing.push('VITE_ZEN_ADDRESS');
  return missing;
}
