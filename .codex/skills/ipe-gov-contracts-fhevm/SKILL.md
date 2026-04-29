---
name: ipe-gov-contracts-fhevm
description: Use when changing ipe-gov Solidity contracts, Hardhat deploy scripts, FHEVM encrypted voting, Unlock membership checks, proposal windows, liquid delegation, exported ABIs, or contract tests.
---

# ipe-gov Contracts and FHEVM

## Primary files

- `packages/contracts/contracts/UnlockConfidentialGovernor.sol`
- `packages/contracts/contracts/UnlockConfidentialGovernorLiquid.sol`
- `packages/contracts/contracts/LiquidDelegation.sol`
- `packages/contracts/deploy/*.ts`
- `packages/contracts/test/*.ts`
- `packages/contracts/scripts/export-abis.ts`
- `packages/sdk/src/addresses.ts`
- `packages/sdk/src/abis/*`

## Invariants to preserve

- Only valid Unlock key holders can create proposals, vote, and perform member-gated governance actions.
- Ballots are encrypted client-side and accumulated as FHE encrypted values. Individual votes must not become public through events, storage, return values, tests, or helper code.
- Only aggregate results are intended to be decrypted.
- Liquid delegation is per-proposal. The delegation graph is public, but encrypted vote contents stay private.
- Proposal metadata includes IPFS content and target calls. Per-proposal voting windows are part of the governor behavior.
- Sepolia is the pilot deployment target. Do not silently retarget production-like constants without updating `@ipe-gov/sdk`.

## Workflow

1. Read the target contract and its nearest tests before editing.
2. Check whether the change affects ABIs, addresses, deployment arguments, or frontend/worker call sites.
3. Update tests around the smallest behavior surface that changed.
4. Compile so TypeChain and exported ABIs stay in sync.
5. If deploy metadata changes, update `packages/sdk` rather than inlining values elsewhere.

## Commands

```bash
pnpm --filter @ipe-gov/contracts run compile
pnpm --filter @ipe-gov/contracts run test
pnpm --filter @ipe-gov/contracts run lint
pnpm --filter @ipe-gov/contracts run deploy:sepolia
```

Use deploy commands only when the user asks for deployment or the task explicitly requires it.

## Common hazards

- Do not hand-edit exported ABI files when a compile/export command can generate them.
- Do not add plaintext vote choices to events or proposal structs for debugging.
- Do not bypass Unlock membership checks in tests without making the bypass obviously test-only.
- Do not make web or worker packages depend on contract internals; route shared values through `@ipe-gov/sdk`.
- FHEVM behavior can differ between mocked/local and Sepolia paths. Keep network-specific assumptions explicit in tests and docs.
