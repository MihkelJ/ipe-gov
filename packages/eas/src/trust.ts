import type { Address } from "viem";

import type { IpeSchemaName } from "./schemas";

// V1 trust model (spec §"Trusted issuer policy"): there's no on-chain resolver
// — validity is enforced client-side by filtering attestations on the
// `attester` address against the allowlist below. Anyone can technically
// `EAS.attest()` against any schema, but only attestations signed by these
// addresses are surfaced in the UI.
//
// IpeSkill is special: tier=2 (verified) is gated on `org ∪ partners`, but
// tier=1 (peer endorsement) is valid from any wallet that holds a non-revoked
// IpeResident. That graph traversal is implemented at the read-hook level
// when we wire up IpeSkill.

export type EasTrustNetwork = "sepolia";

export const trustedIssuers = {
  sepolia: {
    org: ["0xeC3DcD2C70aD535768dcE7FBe6466442d69387Ef"] as readonly Address[],
    partners: [] as readonly Address[],
  },
} as const satisfies Record<EasTrustNetwork, { org: readonly Address[]; partners: readonly Address[] }>;

// Returns the set of attester addresses whose attestations should be trusted
// for `schema` on `network`. For IpeSkill, callers must additionally branch on
// the `tier` field (this helper returns org ∪ partners, which is the tier=2
// answer). For tier=1 use `isResidentAttester(...)` once it's implemented.
export function trustedAttestersFor(network: EasTrustNetwork, schema: IpeSchemaName): readonly Address[] {
  const { org, partners } = trustedIssuers[network];
  switch (schema) {
    case "IpeResident":
    case "IpeCheckin":
    case "IpeRole":
    case "IpeProjectLaunched":
      return org;
    case "IpeSkill":
      return [...org, ...partners];
  }
}
