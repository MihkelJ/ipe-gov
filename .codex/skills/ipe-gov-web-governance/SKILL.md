---
name: ipe-gov-web-governance
description: Use when changing the ipe-gov web app, proposal UX, voting UX, member/profile pages, TanStack Router routes, Privy/wagmi wiring, FHEVM ballot encryption, sponsored writes, or Cloudflare Pages frontend behavior.
---

# ipe-gov Web Governance

## Primary files

- `apps/web/src/routes/*`
- `apps/web/src/components/*`
- `apps/web/src/hooks/*`
- `apps/web/src/lib/wagmi.ts`
- `apps/web/src/lib/fhevm.ts`
- `apps/web/src/lib/ensApi.ts`
- `apps/web/src/lib/pinApi.ts`
- `apps/web/src/routeTree.gen.ts`
- `apps/web/src/styles.css`

## App responsibilities

- The web app is the reference frontend for the eight-layer stack, not the only possible product.
- It connects to Privy and wagmi for wallet access.
- It encrypts ballots client-side with the FHEVM SDK before sending vote transactions.
- It talks to `VITE_PIN_API_URL`, `VITE_PAYMASTER_PROXY_URL`, and `VITE_ENS_API_URL`.
- It imports addresses, ABIs, and helpers from `@ipe-gov/sdk` and schema data from `@ipe-gov/eas`.

## Workflow

1. Identify the route first, then follow hooks/components outward.
2. Use existing hooks for contract reads, proposal data, membership, sponsored writes, ENS records, and EAS flows.
3. Preserve client-side encryption for ballot choices. Never log or persist plaintext vote choices outside the immediate local UI action.
4. Keep long proposal content in the IPFS envelope flow; do not put large bodies directly on-chain.
5. Keep chain/address/schema constants imported from shared packages.
6. After route changes, regenerate TanStack Router output through the existing tooling if needed; do not hand-edit `routeTree.gen.ts`.

## UI conventions

- Use the existing component primitives in `apps/web/src/components/ui`.
- Prefer lucide icons where icon buttons are needed.
- Keep operational governance screens dense, scannable, and direct. Avoid marketing-style pages inside workflow routes.
- Make loading, empty, error, wallet-disconnected, and non-member states explicit.

## Commands

```bash
pnpm --filter @ipe-gov/web run dev
pnpm --filter @ipe-gov/web run build
pnpm --filter @ipe-gov/web run test
```

If the change depends on contract ABI or address changes, run the relevant contract compile/export flow first.

## Common hazards

- Do not put Pinata, Pimlico, or ENS operator secrets in browser env.
- Do not hardcode worker URLs when env vars or SDK helpers exist.
- Do not duplicate proposal body schema logic in the web app; import from `@ipe-gov/ipfs`.
- Do not treat the worker as authorization by itself; user-facing affordances should reflect Unlock membership, but privileged enforcement belongs on-chain or in the worker gate.
