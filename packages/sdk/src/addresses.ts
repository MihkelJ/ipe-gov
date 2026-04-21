export const addresses = {
  sepolia: {
    token: "0x0000000000000000000000000000000000000000",
    governor: "0x0000000000000000000000000000000000000000",
  },
} as const;

export type NetworkName = keyof typeof addresses;
