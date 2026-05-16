---
name: ipe-gov-workers-services
description: Use when changing ipe-gov Cloudflare Workers, Hono APIs, wrangler config, IPFS pinning, paymaster/RPC proxying, ENS subname issuance, worker secrets, CORS, request signing, or shared worker helpers.
---

# ipe-gov Workers and Services

## Primary files

- `apps/pin-api/src/index.ts`
- `apps/paymaster-proxy/src/index.ts`
- `apps/paymaster-proxy/src/policy.ts`
- `apps/ens-api/src/index.ts`
- `packages/workers-shared/src/*`
- `packages/ipfs/src/*`
- `packages/sdk/src/*`
- `apps/*/wrangler.jsonc`
- `apps/*/.dev.vars.example`

## Service responsibilities

- `pin-api`: verifies a timestamped signature and Unlock key holdership, pins proposal JSON to Pinata, returns a CID.
- `paymaster-proxy`: verifies member eligibility for sponsored user operations, forwards to Pimlico, and provides chain-aware RPC proxying.
- `ens-api`: issues wrapped ENS subnames under the configured parent name, stores claim records in KV, and routes mainnet RPC through `paymaster-proxy`.
- `workers-shared`: owns reusable CORS, signature verification, membership, client, body, and error helpers.

## Security rules

- Workers are gates, not trust roots. Every privileged action must verify membership with `PublicLock.getHasValidKey` or the established shared helper.
- Browser-exposed code must never receive Pinata JWTs, Pimlico keys, ENS operator private keys, or Cloudflare secrets.
- Production worker values go through `wrangler secret put <NAME>`, never plain `vars` in `wrangler.jsonc`.
- Do not make workers import implementation code from sibling workers. Move shared logic to `packages/workers-shared`.
- Keep CORS, error shapes, signature parsing, and membership checks consistent by using shared helpers.

## Workflow

1. Start with the worker's `README.md`, `wrangler.jsonc`, and `src/index.ts`.
2. Check `.dev.vars.example` when adding or renaming environment bindings.
3. Put reusable code in `packages/workers-shared` or `packages/ipfs` as appropriate.
4. Use `@ipe-gov/sdk` for addresses, ABIs, chains, and RPC helper data.
5. Validate the individual worker before broad monorepo checks.

## Commands

```bash
pnpm --filter @ipe-gov/pin-api run dev
pnpm --filter @ipe-gov/pin-api run build
pnpm --filter @ipe-gov/pin-api run typecheck

pnpm --filter @ipe-gov/paymaster-proxy run dev
pnpm --filter @ipe-gov/paymaster-proxy run build
pnpm --filter @ipe-gov/paymaster-proxy run typecheck

pnpm --filter @ipe-gov/ens-api run dev
pnpm --filter @ipe-gov/ens-api run build
pnpm --filter @ipe-gov/ens-api run typecheck
```

Deploy only from scoped package commands:

```bash
pnpm --filter @ipe-gov/pin-api run deploy
pnpm --filter @ipe-gov/paymaster-proxy run deploy
pnpm --filter @ipe-gov/ens-api run deploy
```

## Common hazards

- Do not run `wrangler deploy` from an ambiguous current working directory.
- Do not duplicate membership-check code in each worker when a shared helper exists.
- Do not return raw upstream provider errors if the existing error helper gives the app a stable shape.
- Do not add a new public endpoint without thinking through CORS, method restrictions, request size, and replay protection.
