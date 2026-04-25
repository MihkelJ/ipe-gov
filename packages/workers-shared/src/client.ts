import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { HttpError } from "./error";

export type SepoliaEnv = { SEPOLIA_RPC_URL: string };
export type MainnetEnv = { MAINNET_RPC_URL: string };

/** Public read-only viem client for Sepolia. Throws if the RPC URL secret
 *  is missing so the worker fails fast instead of leaking a confusing
 *  ENOTFOUND. */
export function buildSepoliaReadClient(env: SepoliaEnv) {
  if (!env.SEPOLIA_RPC_URL) {
    throw new HttpError(500, "server missing SEPOLIA_RPC_URL");
  }
  return createPublicClient({
    chain: sepolia,
    transport: http(env.SEPOLIA_RPC_URL),
  });
}

/** Public read-only viem client for Ethereum mainnet. */
export function buildMainnetReadClient(env: MainnetEnv) {
  if (!env.MAINNET_RPC_URL) {
    throw new HttpError(500, "server missing MAINNET_RPC_URL");
  }
  return createPublicClient({
    chain: mainnet,
    transport: http(env.MAINNET_RPC_URL),
  });
}

export type MainnetReadClient = ReturnType<typeof buildMainnetReadClient>;
export type SepoliaReadClient = ReturnType<typeof buildSepoliaReadClient>;
