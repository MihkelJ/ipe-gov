// Source of truth for the Ipê EAS schemas. Pure data — helpers (wire-string
// serializer, sanity validator) live in `./utils`.

import { parseAbiParameters, type AbiParameter } from "viem";

export type SchemaDef = {
  readonly params: readonly AbiParameter[];
  readonly revocable: boolean;
};

export const ipeSchemas = {
  IpeResident: {
    params: parseAbiParameters("bytes32 firstEventId, string metadataURI"),
    revocable: true,
  },
  IpeCheckin: {
    params: parseAbiParameters("bytes32 eventId, uint8 role, bool inPerson, bytes32 externalRefHash"),
    revocable: true,
  },
  IpeRole: {
    params: parseAbiParameters("bytes32 roleId, string metadataURI"),
    revocable: true,
  },
  IpeProjectLaunched: {
    params: parseAbiParameters(
      "bytes32 eventId, bytes32 projectRefUID, string deliverableURI, address[] contributors, uint8 completionStatus, string metadataURI",
    ),
    revocable: true,
  },
  IpeSkill: {
    params: parseAbiParameters("bytes32 skill, uint8 tier, uint8 level, bytes32 evidenceRefUID, string metadataURI"),
    revocable: true,
  },
} as const satisfies Record<string, SchemaDef>;

export type IpeSchemaName = keyof typeof ipeSchemas;
