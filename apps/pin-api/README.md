# @ipe-gov/pin-api

Cloudflare Worker that pins proposal descriptions to IPFS on behalf of
verified Unlock Protocol members.

## What it does

`POST /pin` with:

```json
{
  "text": "<proposal description>",
  "address": "0x...",
  "signature": "0x...",
  "message": "ipe-gov: pin proposal description\naddress: 0x...\ntimestamp: 2026-04-22T…"
}
```

Returns `{ "cid": "bafy..." }`.

The Worker:

1. Verifies `signature` matches `address` over `message` (viem `verifyMessage`).
2. Rejects messages older than 10 minutes.
3. Reads Unlock Protocol `PublicLock.getHasValidKey(address)` over Sepolia RPC.
4. Pins the description JSON to IPFS via Pinata and returns the CID.

## Local dev

```bash
pnpm install
pnpm --filter @ipe-gov/pin-api dev
# Worker runs on http://localhost:8787
```

Put dev secrets in `apps/pin-api/.dev.vars`:

```
PINATA_JWT=eyJhbGci...
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-key>
ALLOWED_ORIGINS=http://localhost:3000
```

## Deploy

```bash
# 1. Auth once
pnpm dlx wrangler login

# 2. Put production secrets (one-time)
cd apps/pin-api
pnpm dlx wrangler secret put PINATA_JWT
pnpm dlx wrangler secret put SEPOLIA_RPC_URL

# 3. Set allowed origins (plain var, not a secret)
pnpm dlx wrangler deploy --var ALLOWED_ORIGINS:https://your-web.example

# Or edit wrangler.jsonc to bake vars in
pnpm --filter @ipe-gov/pin-api run deploy
```

Cloudflare prints the Worker URL after deploy. Point the web app at it:

```
# apps/web/.env.local
VITE_PIN_API_URL=https://ipe-gov-pin-api.<your-subdomain>.workers.dev
```

## Bindings

- `PINATA_JWT` (secret) — Pinata API JWT with `pinJSONToIPFS` permission.
- `SEPOLIA_RPC_URL` (secret) — RPC endpoint for membership reads.
- `ALLOWED_ORIGINS` (var) — comma-separated CORS allowlist; defaults to `*`.
