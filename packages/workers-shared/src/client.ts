import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { paymasterProxyRpcUrl } from "@ipe-gov/sdk";

/** Public read-only viem client for Sepolia, routed through paymaster-proxy
 *  so the upstream RPC URL only lives on that worker. */
export function buildSepoliaReadClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(paymasterProxyRpcUrl(sepolia.id)),
  });
}

/** Public read-only viem client for Ethereum mainnet, routed through
 *  paymaster-proxy. */
export function buildMainnetReadClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(paymasterProxyRpcUrl(mainnet.id)),
  });
}

export type MainnetReadClient = ReturnType<typeof buildMainnetReadClient>;
export type SepoliaReadClient = ReturnType<typeof buildSepoliaReadClient>;
