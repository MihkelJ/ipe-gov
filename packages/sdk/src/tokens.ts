// Hand-authored (unlike addresses.ts, which Hardhat regenerates). IPE is a
// separately-deployed ERC20 on Base mainnet, not produced by this repo's
// deploy scripts.
export const tokens = {
  base: {
    ipe: {
      address: "0x5d48b042d4c479a5A9c25410fe0D66b742DC47dE",
      symbol: "IPE",
      decimals: 18,
      chainId: 8453,
    },
  },
} as const;
