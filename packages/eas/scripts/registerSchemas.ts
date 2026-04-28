import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { ZeroAddress } from "ethers";
import hre from "hardhat";
import { type AbiParameter } from "viem";

import { ipeSchemas, type IpeSchemaName } from "../src/schemas";
import { assertSchemasAreSane, easSchemaString } from "../src/utils";
import { isSchemaRegistered, resolveNetwork, sdkEasFilePath, syncSdkEas } from "./lib";

async function main() {
  assertSchemasAreSane();

  const network = resolveNetwork(hre);
  const [signer] = await hre.ethers.getSigners();

  const registry = new SchemaRegistry(network.schemaRegistry);
  registry.connect(signer);

  const entries = Object.entries(ipeSchemas) as [IpeSchemaName, (typeof ipeSchemas)[IpeSchemaName]][];
  console.log(`registering ${entries.length} schemas on ${network.key} as ${await signer.getAddress()}`);
  console.log(`SchemaRegistry: ${network.schemaRegistry}\n`);

  const out = {} as Record<IpeSchemaName, `0x${string}`>;

  for (const [name, def] of entries) {
    const schema = easSchemaString(def.params as readonly AbiParameter[]);
    const expectedUid = SchemaRegistry.getSchemaUID(schema, ZeroAddress, def.revocable);

    if (await isSchemaRegistered(registry, expectedUid)) {
      console.log(`  ✓ ${name.padEnd(20)} already registered ${expectedUid}`);
      out[name] = expectedUid as `0x${string}`;
      continue;
    }

    console.log(`  → ${name.padEnd(20)} registering...`);
    console.log(`      schema: ${schema}`);
    const tx = await registry.register({ schema, resolverAddress: ZeroAddress, revocable: def.revocable });
    const uid = await tx.wait();
    if (uid !== expectedUid) {
      throw new Error(`UID mismatch for ${name}: expected ${expectedUid}, got ${uid}`);
    }

    console.log(`      uid:    ${uid}\n`);
    out[name] = uid as `0x${string}`;
  }

  syncSdkEas(network, out);
  console.log(`\nDone. SDK EAS module synced → ${sdkEasFilePath()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
