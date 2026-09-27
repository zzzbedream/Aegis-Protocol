import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureNetwork, chainParams } from '../../src/vela/network.js';

const cfg = {
  chainId: 2651420,
  networkName: 'Horizen testnet',
  rpcUrl: 'https://horizen-testnet.rpc.caldera.xyz/http',
  explorerUrl: 'https://explorer-testnet.horizen.io',
};

function fakeWallet(currentHex, { unknownChain = false, rejects = false } = {}) {
  const calls = [];
  return {
    calls,
    async request({ method, params }) {
      calls.push(method);
      if (method === 'eth_chainId') return currentHex;
      if (rejects) throw Object.assign(new Error('User rejected'), { code: 4001 });
      if (method === 'wallet_switchEthereumChain' && unknownChain) {
        unknownChain = false;
        throw Object.assign(new Error('Unrecognized chain'), { code: 4902 });
      }
      if (method === 'wallet_addEthereumChain') assert.deepEqual(params, [chainParams(cfg)]);
      return null;
    },
  };
}

test('chainParams builds the EIP-3085 payload (hex chain id, ETH gas)', () => {
  assert.deepEqual(chainParams(cfg), {
    chainId: '0x28751c',
    chainName: 'Horizen testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [cfg.rpcUrl],
    blockExplorerUrls: [cfg.explorerUrl],
  });
});

test('does nothing when the wallet is already on the right chain', async () => {
  const w = fakeWallet('0x28751c');
  await ensureNetwork(w, cfg);
  assert.deepEqual(w.calls, ['eth_chainId']);
});

test('switches chain, adding it first when the wallet does not know it', async () => {
  const w = fakeWallet('0x1', { unknownChain: true });
  await ensureNetwork(w, cfg);
  assert.deepEqual(w.calls, ['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain']);
});

test('reports a clear error when the user rejects the switch', async () => {
  await assert.rejects(ensureNetwork(fakeWallet('0x1', { rejects: true }), cfg), /Switch your wallet to Horizen testnet/);
});

test('without an RPC URL it cannot add the chain and says so', async () => {
  const w = fakeWallet('0x1', { unknownChain: true });
  await assert.rejects(ensureNetwork(w, { ...cfg, rpcUrl: null }), /Switch your wallet to Horizen testnet/);
});
