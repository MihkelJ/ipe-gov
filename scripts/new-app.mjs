#!/usr/bin/env node
// Scaffold a new community app by copying apps/starter into apps/<name>.
// Usage: pnpm new-app <name>   (or just `pnpm new-app` to be prompted)

import { cp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, argv, exit } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const APPS = join(ROOT, "apps");
const TEMPLATE = join(APPS, "starter");
const RESERVED = new Set(["starter", "web", "pin-api", "paymaster-proxy", "ens-api"]);

async function prompt(q) {
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(q)).trim();
  } finally {
    rl.close();
  }
}

function validateName(name) {
  if (!name) return "Name is required.";
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return "Lowercase letters, digits, and hyphens, starting with a letter (e.g., bookclub, dao-tools).";
  }
  if (RESERVED.has(name)) return `"${name}" is reserved by an existing app.`;
  return null;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findNextPort() {
  const entries = await readdir(APPS, { withFileTypes: true });
  let max = 3000;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const pkg = JSON.parse(await readFile(join(APPS, entry.name, "package.json"), "utf8"));
      const dev = pkg.scripts?.dev ?? "";
      const m = dev.match(/--port\s+(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    } catch {
      /* not every app has a dev port; skip */
    }
  }
  return max + 1;
}

async function main() {
  let name = argv[2] ?? (await prompt("What's your app called? (e.g., bookclub) "));

  const err = validateName(name);
  if (err) {
    console.error(`✖ ${err}`);
    exit(1);
  }

  const dst = join(APPS, name);
  if (await exists(dst)) {
    console.error(`✖ apps/${name} already exists.`);
    exit(1);
  }
  if (!(await exists(TEMPLATE))) {
    console.error(`✖ template not found at apps/starter.`);
    exit(1);
  }

  const port = await findNextPort();

  console.log(`→ Creating apps/${name} from apps/starter (port ${port}) ...`);

  await cp(TEMPLATE, dst, {
    recursive: true,
    filter: (src) => {
      const rel = src.slice(TEMPLATE.length).split(/[\\/]/).filter(Boolean);
      if (rel.length === 0) return true;
      const top = rel[0];
      // Don't carry over build artifacts, tooling caches, or local-only env.
      if (top === "node_modules" || top === "dist" || top === ".tanstack" || top === ".turbo")
        return false;
      if (top === ".env.local") return false;
      return true;
    },
  });

  // Rename the package and bump the dev port.
  const pkgPath = join(dst, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.name = `@ipe-gov/${name}`;
  if (pkg.scripts?.dev) {
    pkg.scripts.dev = pkg.scripts.dev.replace(/--port\s+\d+/, `--port ${port}`);
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Replace the README with a minimal stub so the new app feels new.
  const readme = `# @ipe-gov/${name}

Your app on the shared ipe-gov stack.

## Run

\`\`\`bash
pnpm --filter @ipe-gov/${name} dev
\`\`\`

Opens http://localhost:${port}.

## Build

Everything is already wired — login, wallets, the membership check, sponsored
writes, on-chain credentials, IPFS, FHE. See \`apps/web\` for full reference
patterns, and the shared building blocks under \`packages/\`.

When ready, open a PR adding this folder so the community picks up where you
left off.
`;
  await writeFile(join(dst, "README.md"), readme);

  console.log("");
  console.log(`✓ Created apps/${name}`);
  console.log("");
  console.log("Next:");
  console.log("  pnpm install");
  console.log(`  pnpm --filter @ipe-gov/${name} dev`);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
