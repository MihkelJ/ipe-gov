import { decodeAbiParameters, encodeAbiParameters, type AbiParameter, type AbiParameterToPrimitiveType } from "viem";

import { ipeSchemas, type IpeSchemaName } from "./schemas";

// Per-schema typed encode/decode helpers. Consumers get the full tuple
// signature inferred from `parseAbiParameters` — e.g.
// `encodeAttestationData("IpeResident", [bytes32Hex, "ipfs://..."])` is
// type-checked at the argument level. The `as never` casts are needed because
// indexing `ipeSchemas[name]` widens the params tuple beyond what the typed
// viem signatures accept; the public types reconstruct it.

type SchemaParams<N extends IpeSchemaName> = (typeof ipeSchemas)[N]["params"];

// viem only exposes the singular `AbiParameterToPrimitiveType`. Map it over the
// const-typed tuple to recover the full argument shape.
type ParamsToValues<T extends readonly AbiParameter[]> = {
  -readonly [K in keyof T]: T[K] extends AbiParameter ? AbiParameterToPrimitiveType<T[K]> : never;
};

export type AttestationValues<N extends IpeSchemaName> = ParamsToValues<SchemaParams<N>>;

export function encodeAttestationData<N extends IpeSchemaName>(name: N, values: AttestationValues<N>): `0x${string}` {
  return encodeAbiParameters(ipeSchemas[name].params, values as never);
}

export function decodeAttestationData<N extends IpeSchemaName>(name: N, hex: `0x${string}`): AttestationValues<N> {
  return decodeAbiParameters(ipeSchemas[name].params, hex) as AttestationValues<N>;
}
