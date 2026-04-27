import { type AbiParameter } from "viem";

import { ipeSchemas, type IpeSchemaName, type SchemaDef } from "./schemas";

// Canonical EAS wire form: comma-separated `<type> <name>` pairs with no
// whitespace around commas. UID derivation is bytewise sensitive — extra
// spaces silently change every UID.
export function easSchemaString(params: readonly AbiParameter[]): string {
  return params.map((p) => `${p.type} ${p.name}`).join(",");
}

// Authoring-time sanity check. Called from the registration script before any
// tx is broadcast; not invoked at module load so it doesn't run in browser /
// worker contexts that import these schemas through the SDK re-export.
//
// Catches the authoring mistakes viem's `parseAbiParameters` doesn't surface:
//   - anonymous fields (EAS requires named fields)
//   - duplicate field names within a schema
//   - two schemas whose wire string + revocable flag collide → same UID
export function assertSchemasAreSane() {
  const seenStrings = new Map<string, string>();

  for (const [name, def] of Object.entries(ipeSchemas) as [IpeSchemaName, SchemaDef][]) {
    for (const [i, p] of def.params.entries()) {
      if (!p.name || p.name.length === 0) {
        throw new Error(`schemas: ${name} field #${i} (${p.type}) has no name`);
      }
    }

    const fieldNames = def.params.map((p) => p.name);
    const dupField = fieldNames.find((n, i) => fieldNames.indexOf(n) !== i);
    if (dupField) {
      throw new Error(`schemas: ${name} has duplicate field name "${dupField}"`);
    }

    const wire = `${easSchemaString(def.params)}|${def.revocable}`;
    const prior = seenStrings.get(wire);
    if (prior) {
      throw new Error(`schemas: ${name} collides with ${prior} (identical schema)`);
    }
    seenStrings.set(wire, name);
  }
}
