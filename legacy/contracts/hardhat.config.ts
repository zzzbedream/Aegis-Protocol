import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
    },
    // Horizen testnet (OP Stack L3 settling to Base Sepolia). 7332 was the deprecated Horizen EON chain.
    horizenL3Testnet: {
      url: process.env.HORIZEN_L3_RPC || "https://horizen-testnet.rpc.caldera.xyz/http",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 2651420,
    },
    // Horizen mainnet (OP Stack L3 settling to Base).
    horizenMainnet: {
      url: process.env.HORIZEN_MAINNET_RPC || "https://horizen.calderachain.xyz/http",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 26514,
    },
  },
};

export default config;
