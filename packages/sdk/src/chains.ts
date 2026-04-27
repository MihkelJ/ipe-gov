import { base, mainnet, sepolia } from "viem/chains";
import type { Chain, Hex } from "viem";
import { addresses } from "./addresses";

/**
 * Chain config consumed by the paymaster-proxy worker (to dispatch
 * `/rpc/:chainId` to the right upstream + policy) and by the web app (to
 * build per-chain transport URLs against a single proxy base).
 *
 *   - `nodeRpcSecretName` is the wrangler secret holding the public RPC URL
 *     for non-bundler methods on this chain. Per project convention every
 *     RPC URL is set via `wrangler secret put`, never `vars`.
 *   - `sponsorship` is `null` for chains where members aren't sponsored via
 *     an Unlock lock, and `{ lockAddress }` when membership-gated sponsorship
 *     is enabled.
 *   - `operatorAllowlistSecretName` is the wrangler secret holding a
 *     comma-separated list of system-actor addresses (e.g. ens-api's mint
 *     wallet) that bypass the membership check. When set, the proxy accepts
 *     bundler methods even if `sponsorship` is `null`. Operator addresses
 *     are public, but stored as a secret so the list rotates without a
 *     redeploy.
 */
export type ChainConfig = {
  chainId: number;
  chain: Chain;
  nodeRpcSecretName: string;
  sponsorship: { lockAddress: Hex } | null;
  operatorAllowlistSecretName?: string;
};

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  [sepolia.id]: {
    chainId: sepolia.id,
    chain: sepolia,
    nodeRpcSecretName: "RPC_URL_11155111",
    sponsorship: { lockAddress: addresses.sepolia.lock as Hex },
  },
  [base.id]: {
    chainId: base.id,
    chain: base,
    nodeRpcSecretName: "RPC_URL_8453",
    // No lock deployed on Base yet — sponsorship stays disabled until one
    // exists. Bundler/paymaster methods will be rejected with -32601.
    sponsorship: null,
  },
  [mainnet.id]: {
    chainId: mainnet.id,
    chain: mainnet,
    nodeRpcSecretName: "RPC_URL_1",
    // No member-side sponsorship (we don't run an Unlock lock on mainnet).
    // The operator allowlist below opens bundler methods only for the
    // ens-api mint wallet so subname mints can be sponsored without
    // exposing public sponsorship.
    sponsorship: null,
    operatorAllowlistSecretName: "OPERATOR_ALLOWLIST_1",
  },
};

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return CHAIN_CONFIGS[chainId];
}

export const SUPPORTED_CHAIN_IDS: readonly number[] = Object.keys(CHAIN_CONFIGS).map(Number);
