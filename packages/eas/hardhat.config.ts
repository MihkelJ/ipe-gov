// Minimal Hardhat config — this package compiles no Solidity. Hardhat is here
// only as a script runner so credentials (DEPLOYER_PRIVATE_KEY, INFURA_API_KEY)
// flow through `npx hardhat vars` exactly the way they do in
// `packages/contracts`. Keeping the same UX prevents key-management drift.

import "@nomicfoundation/hardhat-ethers";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";

const MNEMONIC = vars.get("MNEMONIC", "test test test test test test test test test test test junk");
const INFURA_API_KEY = vars.get("INFURA_API_KEY", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
const DEPLOYER_PRIVATE_KEY = vars.get("DEPLOYER_PRIVATE_KEY", "");

const accounts = DEPLOYER_PRIVATE_KEY
  ? [DEPLOYER_PRIVATE_KEY.startsWith("0x") ? DEPLOYER_PRIVATE_KEY : `0x${DEPLOYER_PRIVATE_KEY}`]
  : { mnemonic: MNEMONIC, path: "m/44'/60'/0'/0/", count: 10 };

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: {
      accounts,
      chainId: 11155111,
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
    },
  },
};

export default config;
