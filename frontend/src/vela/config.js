/**
 * Deployment configuration, injected at build time through Vite env variables.
 * Nothing here is invented: when a value is missing the UI stays in "not configured"
 * mode and every action is disabled.
 */
const env = import.meta.env ?? {};

function addr(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v : null;
}

export const VELA_CONFIG = {
  networkName: env.VITE_NETWORK_NAME || 'Vela (Base Sepolia, early access)',
  chainId: env.VITE_CHAIN_ID ? Number(env.VITE_CHAIN_ID) : null,
  processorEndpoint: addr(env.VITE_VELA_PROCESSOR_ENDPOINT),
  teeAuthenticator: addr(env.VITE_VELA_TEE_AUTHENTICATOR),
  applicationId: env.VITE_AEGIS_APP_ID ? BigInt(env.VITE_AEGIS_APP_ID) : null,
  // Max fee (wei, paid in ETH) attached to each request; refunded if unused.
  maxFeeWei: BigInt(env.VITE_MAX_FEE_WEI || '100000000000000'),
  assets: {
    debt: { symbol: 'USDC', address: addr(env.VITE_USDC_ADDRESS), decimals: 6 },
    collateral: [{ symbol: 'ZEN', address: addr(env.VITE_ZEN_ADDRESS), decimals: 18 }],
  },
};

export function missingConfig(cfg = VELA_CONFIG) {
  const missing = [];
  if (!cfg.processorEndpoint) missing.push('VITE_VELA_PROCESSOR_ENDPOINT');
  if (!cfg.teeAuthenticator) missing.push('VITE_VELA_TEE_AUTHENTICATOR');
  if (cfg.applicationId === null) missing.push('VITE_AEGIS_APP_ID');
  if (!cfg.assets.debt.address) missing.push('VITE_USDC_ADDRESS');
  if (!cfg.assets.collateral[0].address) missing.push('VITE_ZEN_ADDRESS');
  return missing;
}
