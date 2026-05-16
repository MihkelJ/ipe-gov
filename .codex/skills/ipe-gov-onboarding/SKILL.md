---
name: ipe-gov-onboarding
description: Use when working in the ipe-gov monorepo and you need the repo map, eight-layer network-city stack, package responsibilities, local commands, deployment targets, or cross-package change guidance before editing code.
---

# ipe-gov Onboarding

## Start here

- Read `README.md` when the task touches the product story, layer model, public services, or deployment flow.
- Treat the repo as a reference implementation for an eight-layer network-city governance stack:
  `L8 ENS identity`, `L7 EAS provenance`, `L6 FHEVM privacy`, `L5 Governor + liquid delegation`, `L4 Unlock membership`, `L3 Privy + ERC-4337/EIP-7702 access`, `L2 IPFS content`, `L1 Ethereum settlement`.
- Sepolia is the pilot chain for governance, membership, and EAS. ENS subname issuance uses L1 mainnet through `apps/ens-api`.

## Package map

- `apps/web`: Vite + TanStack Router reference frontend with Privy, wagmi, FHEVM SDK, proposal/member flows, and Cloudflare Pages deploy.
- `apps/pin-api`: Hono Worker for signature-gated IPFS pinning.
- `apps/paymaster-proxy`: Hono Worker for ERC-4337/ERC-7677 sponsorship and chain-aware RPC proxying.
- `apps/ens-api`: Hono Worker for wrapped ENS subname issuance under the configured parent name.
- `packages/contracts`: Hardhat contracts for `UnlockConfidentialGovernorLiquid` and `LiquidDelegation`.
- `packages/sdk`: single source of truth for addresses, ABIs, chain config, and shared helpers.
- `packages/eas`: EAS schema definitions, codecs, UIDs, and Sepolia registration scripts.
- `packages/ipfs`: proposal body envelope types, validation, Pinata helpers, and gateway helpers.
- `packages/workers-shared`: shared Hono middleware and helpers for workers.

## Cross-package rules

- Do not inline deployed addresses, ABIs, schema UIDs, or chain constants in apps or workers. Import them from `@ipe-gov/sdk` or `@ipe-gov/eas`.
- Workers are gates, not trust roots. Privileged worker actions must verify the caller holds a valid Unlock key before doing work.
- Browser code must never receive Pinata JWTs, Pimlico API keys, or ENS operator keys.
- Share worker helper code through `packages/workers-shared`; workers should not import source code from each other.
- Generated outputs such as route trees and exported ABIs should be regenerated through the repo commands instead of hand-edited.

## Common commands

From the repo root:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm compile
```

Scoped commands:

```bash
pnpm --filter @ipe-gov/web run dev
pnpm --filter @ipe-gov/contracts run compile
pnpm --filter @ipe-gov/contracts run test
pnpm --filter @ipe-gov/eas run register-schemas:sepolia
pnpm --filter @ipe-gov/pin-api run dev
pnpm --filter @ipe-gov/paymaster-proxy run dev
pnpm --filter @ipe-gov/ens-api run dev
```

## Environment and deploy notes

- Local env templates live in each app/package: `apps/web/.env.example`, worker `.dev.vars.example` files, and `packages/contracts/.env.example`.
- Production worker values go through `wrangler secret put <NAME>`, never plain `vars` in `wrangler.jsonc`.
- Always deploy workers through package filters from the repo root:

```bash
pnpm --filter @ipe-gov/pin-api run deploy
pnpm --filter @ipe-gov/paymaster-proxy run deploy
pnpm --filter @ipe-gov/ens-api run deploy
```

## Validation guidance

- For broad changes, prefer the narrow package check first, then `pnpm build` or `pnpm test` if the change crosses package boundaries.
- Contract changes usually require compile, tests, and ABI export verification.
- Worker changes usually require typecheck/build for the specific worker and a review of secret handling.
- Web changes usually require `pnpm --filter @ipe-gov/web run build`; run focused tests when present.
