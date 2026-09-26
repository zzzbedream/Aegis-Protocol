/**
 * Aegis Protocol Contracts & Network Configuration
 */

export const NETWORK_CONFIG = {
  // Horizen testnet. 7332 was the deprecated Horizen EON chain; the gas token is ETH, not ZEN.
  chainId: 2651420,
  chainName: 'Horizen Testnet (Base Sepolia L3)',
  rpcUrl: 'https://horizen-testnet.rpc.caldera.xyz/http',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorer: 'https://explorer-testnet.horizen.io',
};

export const CONTRACT_ADDRESSES = {
  entrypoint: '0x35A21b1979354F9D1c9A7e452F8Eb30c4516De61',
  exitpoint: '0x992B1f0927c3f9168fD0B5c04e2A0D102fE69680',
  vault: '0xc7183455a4C133Ae270771860664b6B7ec320bB1',
  pureFiVerifier: '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7',
  zkVerifyBridge: '0x5fbb3f4e524932bc52c54ed141e6575265abd53a',
  zenToken: '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f',
  rwaToken: '0x8464135c8F25Da09e49BC87830d4571da74ae002',
};

export const SUPPORTED_ASSETS = [
  {
    symbol: 'ZEN',
    name: 'Horizen (LayerZero OFT)',
    address: CONTRACT_ADDRESSES.zenToken,
    decimals: 18,
    isRWA: false,
    ltv: '75%',
    liquidationThreshold: '80%',
    priceUsd: 10.50,
  },
  {
    symbol: 'iTNOTE',
    name: 'US Treasury Note (ERC-7943 RWA)',
    address: CONTRACT_ADDRESSES.rwaToken,
    decimals: 18,
    isRWA: true,
    partition: '0x41454749532e434f4c4c41544552414c2e504152544954494f4e000000000000',
    ltv: '85%',
    liquidationThreshold: '90%',
    priceUsd: 100.25,
  }
];
