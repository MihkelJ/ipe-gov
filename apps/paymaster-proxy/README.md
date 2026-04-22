# @ipe-gov/paymaster-proxy

Cloudflare Worker that sponsors gas for any UserOp whose sender holds a valid
Unlock Protocol membership key. It proxies ERC-4337 bundler and ERC-7677
paymaster JSON-RPC to Pimlico, holding the Pimlico API key server-side so it
never ships to the browser.

Users stay on their EOA via EIP-7702 delegation, so `msg.sender` on the target
contract remains the same address that holds the Unlock key and owns the FHE
encryption context.

## What it does

`POST /rpc` speaks JSON-RPC. For any method whose first param is a UserOp
(`pm_getPaymasterStubData`, `pm_getPaymasterData`, `pm_sponsorUserOperation`,
`eth_sendUserOperation`, `eth_estimateUserOperationGas`) the Worker:

1. Reads `PublicLock.getHasValidKey(userOp.sender)` on Sepolia and requires `true`.
2. Forwards the request to `https://api.pimlico.io/v2/11155111/rpc` with the
   server-side API key.

Read-only bundler methods (`eth_getUserOperationReceipt`, etc.) pass through.
Everything else is refused with JSON-RPC error `-32601`.

## Local dev

```bash
pnpm install
pnpm --filter @ipe-gov/paymaster-proxy dev
# Worker runs on http://localhost:8787
```

Put dev secrets in `apps/paymaster-proxy/.dev.vars`:

```
PIMLICO_API_KEY=pim_...
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-key>
ALLOWED_ORIGINS=http://localhost:3000
```

## Deploy

```bash
cd apps/paymaster-proxy
pnpm dlx wrangler secret put PIMLICO_API_KEY
pnpm dlx wrangler secret put SEPOLIA_RPC_URL
pnpm dlx wrangler deploy --var ALLOWED_ORIGINS:https://your-web.example
```

Point the web app at the Worker URL:

```
# apps/web/.env.local
VITE_PAYMASTER_PROXY_URL=https://ipe-gov-paymaster-proxy.<your-subdomain>.workers.dev/rpc
```

## Bindings

- `PIMLICO_API_KEY` (secret) — Pimlico key with Sepolia bundler + paymaster access.
- `SEPOLIA_RPC_URL` (secret) — RPC endpoint for the Unlock `getHasValidKey` read.
- `ALLOWED_ORIGINS` (var) — comma-separated CORS allowlist; defaults to `*`.
