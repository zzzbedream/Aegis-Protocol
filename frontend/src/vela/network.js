/**
 * Puts an EIP-1193 wallet on the deployment's chain: switch, or add-then-switch when the wallet
 * does not know the chain yet (EIP-3085 / EIP-3326). Horizen pays gas in ETH.
 */

const UNRECOGNIZED_CHAIN = 4902;

export function chainParams(cfg) {
  return {
    chainId: '0x' + cfg.chainId.toString(16),
    chainName: cfg.networkName,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [cfg.rpcUrl],
    blockExplorerUrls: cfg.explorerUrl ? [cfg.explorerUrl] : [],
  };
}

export async function ensureNetwork(ethereum, cfg) {
  const current = parseInt(await ethereum.request({ method: 'eth_chainId' }), 16);
  if (!cfg.chainId || current === cfg.chainId) return;
  const target = chainParams(cfg);
  try {
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: target.chainId }] });
    } catch (e) {
      if (e?.code !== UNRECOGNIZED_CHAIN || !cfg.rpcUrl) throw e;
      await ethereum.request({ method: 'wallet_addEthereumChain', params: [target] });
    }
  } catch (e) {
    throw new Error(`Switch your wallet to ${cfg.networkName} (chain ${cfg.chainId}): ${e?.message || e}`);
  }
}
