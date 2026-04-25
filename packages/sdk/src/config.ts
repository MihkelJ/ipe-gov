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
export const PAYMASTER_PROXY_BASE =
  "https://ipe-gov-paymaster-proxy.ipe-gov.workers.dev/rpc";

export const paymasterProxyRpcUrl = (chainId: number): string =>
  `${PAYMASTER_PROXY_BASE}/${chainId}`;
