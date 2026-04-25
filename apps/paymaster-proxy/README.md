# @ipe-gov/paymaster-proxy

Cloudflare Worker that holds the Pimlico API key server-side and routes
ERC-4337 bundler / ERC-7677 paymaster JSON-RPC traffic on a per-chain basis.
For each chain it can: forward read methods to a public RPC, sponsor
bundler methods for Unlock-membership holders, and sponsor bundler methods
for system-actor addresses (the operator allowlist).

Users stay on their EOA via EIP-7702 delegation, so `msg.sender` on the
target contract remains the same address that holds their Unlock key and
owns whatever state lives downstream of it.

## Routing

`POST /rpc/:chainId` — JSON-RPC. The same chain id is used for the upstream
Pimlico endpoint (`https://api.pimlico.io/v2/<chainId>/rpc`). `POST /rpc`
without a chainId defaults to Sepolia for backward compatibility with the
original frontend builds.

For each request the worker:

1. Looks up `getChainConfig(chainId)` from `@ipe-gov/sdk`. Unknown chains
   return `-32602`.
2. Reads the chain's RPC URL from a worker secret named per the
   `nodeRpcSecretName` field (e.g. `RPC_URL_1`).
3. For non-bundler methods (`eth_call`, `eth_getLogs`, `eth_chainId`, …)
   — forwards to that RPC. No auth.
4. For bundler methods (`pm_*`, `eth_sendUserOperation`, …) — runs the
   policy, then forwards to Pimlico with the server-side API key.

## Policy

Two ways a UserOp can be sponsored on a given chain:

- **Member sponsorship** — chain has `sponsorship.lockAddress` set; the
  policy reads `PublicLock.getHasValidKey(userOp.sender)` and accepts
  members. Used today on Sepolia.
- **Operator allowlist** — chain has `operatorAllowlistSecretName` set; the
  policy short-circuits for senders whose lowercased address is in the
  comma-separated list at that secret. Used today on Mainnet for ens-api's
  mint wallet, so subname mints sponsor without needing a mainnet Unlock
  lock.

Chains with neither return `-32601` for bundler methods. Calls without a
sender (handshake reads like `eth_supportedEntryPoints`) always pass.

## Bindings

Secrets (`pnpm dlx wrangler secret put <NAME>`):

| name | what |
| --- | --- |
| `PIMLICO_API_KEY` | Pimlico key with bundler + paymaster access on the chains we serve. |
| `RPC_URL_<chainId>` | Public RPC URL for that chain. Provision one per supported chain (matches `nodeRpcSecretName` in `chains.ts`). |
| `OPERATOR_ALLOWLIST_<chainId>` | Comma-separated lowercase addresses allowed to bypass the membership check on this chain (matches `operatorAllowlistSecretName`). |
| `ALLOWED_ORIGINS` | (Optional) Comma-separated CORS allowlist; defaults to `*`. |

## Local dev

```bash
cp apps/paymaster-proxy/.dev.vars.example apps/paymaster-proxy/.dev.vars
# fill in values
pnpm --filter @ipe-gov/paymaster-proxy dev
# Worker on http://localhost:8787
```

## Deploy

```
! pnpm --filter @ipe-gov/paymaster-proxy exec wrangler secret put PIMLICO_API_KEY
! pnpm --filter @ipe-gov/paymaster-proxy exec wrangler secret put RPC_URL_11155111
! pnpm --filter @ipe-gov/paymaster-proxy exec wrangler secret put RPC_URL_8453
! pnpm --filter @ipe-gov/paymaster-proxy exec wrangler secret put RPC_URL_1
! pnpm --filter @ipe-gov/paymaster-proxy exec wrangler secret put OPERATOR_ALLOWLIST_1
! pnpm --filter @ipe-gov/paymaster-proxy run deploy
```

The web app talks to a single base URL and appends `/<chainId>` per request:

```
# apps/web/.env.local
VITE_PAYMASTER_PROXY_URL=https://ipe-gov-paymaster-proxy.<your-subdomain>.workers.dev/rpc
```

## Notes

- The membership-check branch in `policy.ts` is currently `return;`-stubbed;
  the operator allowlist short-circuit runs before that early-return, so
  it's already enforced. Re-enable the lock check before opening sponsorship
  to public members.
- Operator allowlists are stored as worker secrets, not in code, so the set
  of system addresses can rotate without redeploying the proxy.
