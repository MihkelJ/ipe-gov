export const addresses = {
  sepolia: {
    governor: "0x328A4a458384701272EcB457778922358063C363",
    lock: "0x6d7Cd6994e5e976877451216A460D15346c4E4c7",
  },
} as const;

export type NetworkName = keyof typeof addresses;
