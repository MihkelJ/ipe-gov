import { createPublicClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { HttpError } from "./error";

export type SepoliaEnv = { RPC_URL_11155111: string };
export type MainnetEnv = { RPC_URL_1: string };

/** Public read-only viem client for Sepolia. Throws if the RPC URL secret
 *  is missing so the worker fails fast instead of leaking a confusing
 *  ENOTFOUND. */
export function buildSepoliaReadClient(env: SepoliaEnv) {
  if (!env.RPC_URL_11155111) {
    throw new HttpError(500, "server missing RPC_URL_11155111");
  }
  return createPublicClient({
    chain: sepolia,
    transport: http(env.RPC_URL_11155111),
  });
}

/** Public read-only viem client for Ethereum mainnet. */
export function buildMainnetReadClient(env: MainnetEnv) {
  if (!env.RPC_URL_1) {
    throw new HttpError(500, "server missing RPC_URL_1");
  }
  return createPublicClient({
    chain: mainnet,
    transport: http(env.RPC_URL_1),
  });
}

export type MainnetReadClient = ReturnType<typeof buildMainnetReadClient>;
export type SepoliaReadClient = ReturnType<typeof buildSepoliaReadClient>;
