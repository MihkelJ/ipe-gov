import { useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";

import { easAbi, easContracts, schemaUids, type IpeSchemaName } from "@ipe-gov/sdk";

import { useSponsoredWrite } from "../useSponsoredWrite";

// Revokes an attestation by UID. Only the original attester can revoke (this
// is enforced by the EAS contract — the trust filter on read hooks is a
// separate, client-side check). The signing wallet must therefore match the
// `attester` field of the attestation being revoked.
//
// Sponsored on Sepolia through the same paymaster rail as issuance.
export function useRevokeAttestation<N extends IpeSchemaName>(name: N) {
  const sponsored = useSponsoredWrite();
  const queryClient = useQueryClient();

  const mutateAsync = async ({ uid, recipient }: { uid: Hex; recipient: Hex }): Promise<Hex> => {
    const txHash = await sponsored.mutateAsync({
      address: easContracts.sepolia.eas as Hex,
      abi: easAbi,
      functionName: "revoke",
      args: [
        {
          schema: schemaUids.sepolia[name],
          data: { uid, value: 0n },
        },
      ],
    });

    // Invalidate the matching read query so the UI refreshes once the
    // indexer flips `revoked: true` (typically a few seconds after the tx
    // confirms).
    await queryClient.invalidateQueries({ queryKey: ["eas", queryKeyFor(name), recipient] });
    return txHash;
  };

  return {
    mutateAsync,
    isPending: sponsored.isPending,
    error: sponsored.error,
  };
}

function queryKeyFor(name: IpeSchemaName): string {
  switch (name) {
    case "IpeResident":
      return "residency";
    case "IpeCheckin":
      return "checkins";
    case "IpeRole":
      return "roles";
    case "IpeProjectLaunched":
      return "projects";
    case "IpeSkill":
      return "skills";
  }
}
