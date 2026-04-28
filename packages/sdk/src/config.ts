/**
 * Shared configuration for the offchain subname pilot. Subnames live under
 * the `ENS_PARENT_NAME` parent and are issued + resolved through NameStone's
 * gasless ENS infrastructure. Switching to a production parent later means
 * swapping this constant and pointing the new parent's mainnet ENS resolver
 * at NameStone (one-time owner action).
 */
export const ENS_PARENT_NAME = "govdemo.eth";

/**
 * Public base URL of the paymaster-proxy worker. All RPC traffic from sibling
 * workers (pin-api, ens-api) routes through `<base>/<chainId>` so node-RPC
 * credentials live in exactly one place — the proxy. The proxy forwards
 * non-bundler methods straight to the upstream node and routes bundler/
 * paymaster methods to Pimlico.
 */
export const PAYMASTER_PROXY_BASE = "https://ipe-gov-paymaster-proxy.ipe-gov.workers.dev/rpc";

export const paymasterProxyRpcUrl = (chainId: number): string => `${PAYMASTER_PROXY_BASE}/${chainId}`;

/**
 * Approximate seconds-per-block on Sepolia. Used by the web app to translate
 * the user's chosen voting duration (in hours) into a block count for
 * `UnlockConfidentialGovernorLiquid.propose`. Sepolia targets 12 s/block.
 */
export const SEPOLIA_BLOCK_TIME_SECONDS = 12;

/**
 * Per-proposal voting-window bounds enforced by `UnlockConfidentialGovernorLiquid`.
 * Mirrored here so the wizard can validate locally before submitting on-chain.
 * Keep in sync with the constructor args in `packages/contracts/deploy/01_governor.ts`.
 *
 * - MIN: 50 blocks ≈ 10 minutes on Sepolia
 * - MAX: 216_000 blocks ≈ 30 days on Sepolia
 */
export const MIN_VOTING_PERIOD_BLOCKS = 50;
export const MAX_VOTING_PERIOD_BLOCKS = 216_000;
