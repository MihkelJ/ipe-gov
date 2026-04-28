import { SchemaRegistry } from "@ethereum-attestation-service/eas-sdk";
import { ZeroHash } from "ethers";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { Project } from "ts-morph";

import { type IpeSchemaName } from "../src/schemas";

const SDK_EAS_FILE = resolve(__dirname, "../../sdk/src/eas.ts");

export type Network = { key: string; chainId: number; eas: string; schemaRegistry: string };

// Looks up a contract address from upstream `eas-contracts`'s deployments JSON.
// `network` must match a deployment dir name (e.g. "sepolia", "base-sepolia").
const loadAddress = (() => {
  const req = createRequire(__filename);
  return (network: string, contract: "EAS" | "SchemaRegistry"): string =>
    req(`@ethereum-attestation-service/eas-contracts/deployments/${network}/${contract}.json`).address;
})();

export function resolveNetwork(hre: HardhatRuntimeEnvironment): Network {
  const key = hre.network.name;
  const chainId = hre.network.config.chainId;
  if (!chainId) throw new Error(`hardhat network "${key}" has no chainId`);
  return {
    key,
    chainId,
    eas: loadAddress(key, "EAS"),
    schemaRegistry: loadAddress(key, "SchemaRegistry"),
  };
}

// EAS SDK throws "Schema not found" when a UID has no record. Use that as the
// idempotency signal — any other error must propagate.
export async function isSchemaRegistered(registry: SchemaRegistry, uid: string): Promise<boolean> {
  try {
    const record = await registry.getSchema({ uid });
    return record.uid !== ZeroHash;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/schema not found/i.test(msg)) throw e;
    return false;
  }
}

type ContractsMap = Record<string, { chainId: number; eas: string; schemaRegistry: string }>;
type UidMap = Record<string, string>;

// Patches `easContracts` and `schemaUids` in `packages/sdk/src/eas.ts` via the
// TS AST. Existing entries for other networks are preserved; only the row for
// `network.key` is overwritten.
export function syncSdkEas(network: Network, current: Record<IpeSchemaName, `0x${string}`>) {
  if (!existsSync(SDK_EAS_FILE)) {
    throw new Error(`${SDK_EAS_FILE} not found — bootstrap it from the seed before running this script.`);
  }

  const project = new Project({ tsConfigFilePath: undefined });
  const sf = project.addSourceFileAtPath(SDK_EAS_FILE);

  const contractsDecl = sf.getVariableDeclarationOrThrow("easContracts");
  const uidsDecl = sf.getVariableDeclarationOrThrow("schemaUids");

  const existingContracts = readInitializer<ContractsMap>(contractsDecl.getInitializerOrThrow().getText()) ?? {};
  const existingUids = readInitializer<Record<string, UidMap>>(uidsDecl.getInitializerOrThrow().getText()) ?? {};

  // Drop any stale placeholder rows (all-zero UIDs) so they don't leak forward.
  for (const [net, uids] of Object.entries(existingUids)) {
    if (Object.values(uids).every((v) => v === ZeroHash)) delete existingUids[net];
  }

  const mergedContracts: ContractsMap = {
    ...existingContracts,
    [network.key]: { chainId: network.chainId, eas: network.eas, schemaRegistry: network.schemaRegistry },
  };
  const mergedUids = { ...existingUids, [network.key]: current };

  contractsDecl.setInitializer(`${formatObject(mergedContracts, formatContractEntry)} as const`);
  uidsDecl.setInitializer(`${formatObject(mergedUids, formatUidEntry)} as const`);

  sf.saveSync();

  // ts-morph indents continuation lines to the initializer column, leaving
  // multi-line object literals visually over-indented. Run prettier on the
  // file to clean it up — keeps git diffs minimal across runs.
  prettierFormatInPlace(SDK_EAS_FILE);
}

function prettierFormatInPlace(file: string) {
  execFileSync("pnpm", ["exec", "prettier", "--write", file], { stdio: "inherit" });
}

export function sdkEasFilePath(): string {
  return SDK_EAS_FILE;
}

// Parse the text of an `as const` object-literal initializer back into a JS
// value. Tolerates the trailing `as const` cast.
function readInitializer<T>(text: string): T | undefined {
  const stripped = text.replace(/\s+as\s+const\s*$/, "");
  try {
    return new Function(`"use strict"; return (${stripped});`)() as T;
  } catch {
    return undefined;
  }
}

function formatObject<T>(obj: Record<string, T>, fmt: (v: T) => string): string {
  const entries = Object.entries(obj)
    .map(([k, v]) => `  ${k}: ${fmt(v)},`)
    .join("\n");
  return `{\n${entries}\n}`;
}

function formatContractEntry(v: { chainId: number; eas: string; schemaRegistry: string }): string {
  return (
    `{\n` +
    `    chainId: ${v.chainId},\n` +
    `    eas: "${v.eas}",\n` +
    `    schemaRegistry: "${v.schemaRegistry}",\n` +
    `  }`
  );
}

function formatUidEntry(v: UidMap): string {
  const fields = Object.entries(v)
    .map(([k, val]) => `    ${k}: "${val}",`)
    .join("\n");
  return `{\n${fields}\n  }`;
}
