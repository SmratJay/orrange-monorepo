require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 11155111,
      gasPrice: "auto",
      verify: {
        etherscan: {
          apiKey: process.env.ETHERSCAN_API_KEY,
        },
      },
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "https://ethereum.publicnode.com",
      accounts: process.env.MAINNET_DEPLOYER_PRIVATE_KEY ? [process.env.MAINNET_DEPLOYER_PRIVATE_KEY] : [],
      chainId: 1,
      gasPrice: "auto",
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY,
      mainnet: process.env.ETHERSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    sources: "./",
    tests: "../docs/aspirational-tests",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
