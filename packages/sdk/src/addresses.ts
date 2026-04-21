export const addresses = {
  sepolia: {
    governor: "0x79421a412354E1d81A3e8B5D2E63525ACc01681f",
    lock: "0xcB5968Ab267c4a768bA472a83E14DcE14d3D9d7c",
  },
} as const;

export type NetworkName = keyof typeof addresses;
