export const addresses = {
  sepolia: {
    governor: "0x0FB90C3B717e57a3A23d71b8699f24a8A5A50617",
    lock: "0xfc240d6bfdd13570946dcbb75ff040a035e3c969",
    liquidDelegation: "0xF1A1336119210608a7C6665daF0454F62083D737",
    governorLiquid: "0xeD905FE43897b7352B097379452651b5dEa2075a",
  },
} as const;

export type NetworkName = keyof typeof addresses;
