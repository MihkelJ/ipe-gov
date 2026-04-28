import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";

import { decodeAttestationData, schemaUids, trustedAttestersFor } from "@ipe-gov/sdk";

import { easGraphql } from "./easGraphql";

export type Residency = {
  attestationId: Hex;
  attester: Hex;
  // Unix timestamp (seconds) when residency was first attested.
  since: number;
  // Hash of the event id that triggered residency. Maps back to the public
  // events registry — for v1 we display the truncated hex; richer rendering
  // (event name, location, dates) can resolve via the registry later.
  firstEventId: Hex;
  metadataURI: string;
};

const QUERY = `
  query Residency($recipient: String!, $schemaId: String!, $attesters: [String!]!) {
    attestations(
      where: {
        recipient: { equals: $recipient }
        schemaId: { equals: $schemaId }
        attester: { in: $attesters }
        revoked: { equals: false }
      }
      orderBy: [{ time: asc }]
      take: 1
    ) {
      id
      attester
      time
      data
    }
  }
`;

type Raw = {
  attestations: Array<{ id: Hex; attester: Hex; time: number; data: Hex }>;
};

// First non-revoked IpeResident attestation for `address`, or `null` if the
// address has never been attested as a resident by a trusted issuer. The
// earliest one wins per spec ("since when?" is answered by the original
// attestation).
//
// The `attester ∈ trustedIssuers.org` filter is what makes this safe to render
// — without it, anyone could self-attest as a resident.
export function useResidencyOf(address: Hex | undefined) {
  return useQuery<Residency | null>({
    queryKey: ["eas", "residency", address],
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async () => {
      if (!address) return null;
      const data = await easGraphql<Raw>(QUERY, {
        recipient: address,
        schemaId: schemaUids.sepolia.IpeResident,
        attesters: trustedAttestersFor("sepolia", "IpeResident") as string[],
      });
      const att = data.attestations[0];
      if (!att) return null;

      const [firstEventId, metadataURI] = decodeAttestationData("IpeResident", att.data);
      return {
        attestationId: att.id,
        attester: att.attester,
        since: att.time,
        firstEventId,
        metadataURI,
      };
    },
  });
}
