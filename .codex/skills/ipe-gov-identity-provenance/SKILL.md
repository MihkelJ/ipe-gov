---
name: ipe-gov-identity-provenance
description: Use when changing ipe-gov ENS identity flows, wrapped subname issuance, member profiles, EAS schemas/codecs/UIDs, residency/checkin/role/project/skill attestations, or SDK exports for identity and provenance.
---

# ipe-gov Identity and Provenance

## Primary files

- `apps/ens-api/src/index.ts`
- `apps/web/src/lib/ensApi.ts`
- `apps/web/src/hooks/useSubnameClaim.ts`
- `apps/web/src/hooks/useSubnameRecords.ts`
- `apps/web/src/hooks/useSubnameIdentity.ts`
- `apps/web/src/hooks/eas/*`
- `apps/web/src/components/ResidencyBadge.tsx`
- `apps/web/src/components/AdminAttestPanel.tsx`
- `packages/eas/src/*`
- `packages/eas/scripts/*`
- `packages/sdk/src/eas.ts`
- `packages/sdk/src/addresses.ts`

## Layer model

- Identity is L8: ENS + NameWrapper. A resident should have a portable name such as `*.ipecity.eth` or the configured pilot parent.
- Provenance is L7: EAS attestations. Records should be schema'd, revocable where appropriate, queryable, and portable across cities.
- Membership is L4: Unlock Protocol. Identity and provenance flows may display richer state, but privileged actions still gate on Unlock membership.

## EAS schemas

The current Ipe provenance surface is:

- `IpeResident`
- `IpeCheckin`
- `IpeRole`
- `IpeProjectLaunched`
- `IpeSkill`

Keep schema definitions, codecs, UIDs, and app usage aligned. Apps should import schema data from `@ipe-gov/eas` or `@ipe-gov/sdk`, not copy constants.

## ENS subname rules

- `apps/ens-api` issues wrapped ENS subnames under the configured parent and records claims in KV.
- The ENS operator key must remain server-side.
- Mainnet RPC for ENS routes through `paymaster-proxy`.
- Client code should use the existing `ensApi` helper and subname hooks.

## Workflow

1. Decide whether the task is ENS identity, EAS provenance, or both.
2. For EAS changes, update schema/codecs first, then SDK exports, then web hooks/components.
3. For ENS changes, update `apps/ens-api`, its env template, and the web helper/hooks together.
4. Keep display logic separate from authorization. ENS/EAS can enrich identity; Unlock remains the membership predicate unless the product decision changes explicitly.
5. Run package-specific checks, then web checks if UI or hook behavior changed.

## Commands

```bash
pnpm --filter @ipe-gov/eas run typecheck
pnpm --filter @ipe-gov/eas run register-schemas:sepolia
pnpm --filter @ipe-gov/ens-api run typecheck
pnpm --filter @ipe-gov/ens-api run build
pnpm --filter @ipe-gov/web run build
```

Use schema registration only when the user asks to register or deploy schema changes.

## Common hazards

- Do not treat ENS name ownership as the same thing as Unlock membership unless a task explicitly changes the access model.
- Do not hardcode schema UIDs or chain addresses in UI code.
- Do not expose the ENS operator key or any Cloudflare secret to `apps/web`.
- Do not make a schema migration look backwards-compatible unless existing attestations can still be decoded.
