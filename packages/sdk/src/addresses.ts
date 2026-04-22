export const addresses = {
  sepolia: {
    governor: "0x902374a71dC98987d5b13560CA463cFfdA3bFedb",
    lock: "0x7e288c0df7e57B3c2C1C008A039C6127164edf31",
  },
} as const;

export type NetworkName = keyof typeof addresses;
