import { useQueryClient } from "@tanstack/react-query";
import { zeroHash, type Hex } from "viem";

import {
  easAbi,
  easContracts,
  encodeAttestationData,
  schemaUids,
  type AttestationValues,
  type IpeSchemaName,
} from "@ipe-gov/sdk";

import { useSponsoredWrite } from "../useSponsoredWrite";

// Generic write hook for any of the 5 Ipê schemas. Encodes the typed values
// tuple via `encodeAttestationData`, calls `EAS.attest()` through the existing
// paymaster rail (so the admin doesn't need ETH). Invalidates the matching
// read query on success so badges/lists refresh.
//
// Trust gating happens in the UI — this hook is willing to issue any
// attestation; gate the form on `useIsAttesterAdmin()` (or the IpeSkill
// peer-tier check, when we add it).
export function useIssueAttestation<N extends IpeSchemaName>(name: N) {
  const sponsored = useSponsoredWrite();
  const queryClient = useQueryClient();

  const mutateAsync = async (params: {
    recipient: Hex;
    values: AttestationValues<N>;
    revocable?: boolean;
    refUID?: Hex;
  }): Promise<Hex> => {
    const data = encodeAttestationData(name, params.values);

    const txHash = await sponsored.mutateAsync({
      address: easContracts.sepolia.eas,
      abi: easAbi,
      functionName: "attest",
      args: [
        {
          schema: schemaUids.sepolia[name],
          data: {
            recipient: params.recipient,
            expirationTime: 0n,
            revocable: params.revocable ?? true,
            refUID: params.refUID ?? zeroHash,
            data,
            value: 0n,
          },
        },
      ],
    });

    await queryClient.invalidateQueries({ queryKey: ["eas", queryKeyFor(name), params.recipient] });
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
