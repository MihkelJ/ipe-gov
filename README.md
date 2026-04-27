# ipe-gov

A confidential DAO voting platform: **Unlock Protocol** for membership, **FHEVM** (Zama) for encrypted on-chain ballots,
**ERC-4337** (Pimlico) for sponsored gas, **IPFS** (Pinata) for proposal bodies.

Holders of an Unlock membership key can create proposals and cast votes that remain encrypted on-chain until tally. One
member, one vote — with per-proposal liquid delegation.

Currently deployed to **Sepolia**.

## Monorepo layout

```
ipe-gov/
├── apps/
│   ├── web/               # TanStack Start + Vite frontend (Cloudflare Pages)
│   ├── pin-api/           # Cloudflare Worker: signature-gated IPFS pinning
│   └── paymaster-proxy/   # Cloudflare Worker: ERC-7677 paymaster gated by Unlock key
├── packages/
│   ├── contracts/         # Hardhat + FHEVM governor & liquid delegation contracts
│   ├── sdk/               # Shared addresses, ABIs, and types
│   └── ipfs/              # IPFS pin/fetch helpers (used by web + pin-api)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## How it fits together

- **Contracts** (`packages/contracts`) — `UnlockConfidentialGovernorLiquid` checks that the caller holds a valid Unlock
  key, stores proposal metadata (IPFS CID + target calls), and accumulates encrypted vote tallies as `euint32` via
  FHEVM. `LiquidDelegation` lets members delegate their vote weight per-proposal (delegation graph is public; individual
  votes stay encrypted).
- **pin-api** — The web app can't hold a Pinata JWT in the browser, so proposal bodies go through this worker. The
  client signs a timestamped message; the worker verifies the signature, checks the signer holds a valid Unlock key on
  Sepolia, then pins the JSON to Pinata and returns the CID. That CID goes on-chain with the proposal.
- **paymaster-proxy** — An ERC-4337 JSON-RPC endpoint. Before forwarding `pm_sponsorUserOperation` /
  `eth_sendUserOperation` to Pimlico, it verifies the `userOp.sender` holds a valid Unlock key. Non-members get
  rejected; members get gas-sponsored governance writes. Pimlico's API key stays server-side.
- **web** — TanStack Start app with RainbowKit + wagmi. Connects to `VITE_PIN_API_URL` and `VITE_PAYMASTER_PROXY_URL`.
  Routes: `/` (home), `/proposals` (list), `/proposals/$id` (detail & vote).
- **sdk** — Re-exports compiled contract ABIs and deployed addresses so the web app and workers stay in sync with the
  latest deploy.
- **ipfs** — Shared envelope format (`version`, `kind`, `proposer`, `createdAt`, `text`) plus Pinata pinning and gateway
  fetch helpers.

## Prerequisites

- Node.js >= 20
- pnpm >= 10

## Install

```bash
pnpm install
```

## Environment

Each app has a template; copy and fill in:

```bash
cp apps/web/.env.example              apps/web/.env.local
cp apps/pin-api/.dev.vars.example     apps/pin-api/.dev.vars
cp apps/paymaster-proxy/.dev.vars.example apps/paymaster-proxy/.dev.vars
cp packages/contracts/.env.example    packages/contracts/.env   # or use `hardhat vars set`
```

Hardhat prefers its vault over `.env`:

```bash
cd packages/contracts
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npx hardhat vars set ETHERSCAN_API_KEY   # optional, for verification
```

## Common commands

```bash
pnpm dev              # run every package's dev task in parallel
pnpm build            # build every package
pnpm compile          # compile contracts + export ABIs to the sdk
pnpm test             # run contract tests
pnpm deploy:sepolia   # deploy contracts to Sepolia
```

Scoped to one package:

```bash
pnpm --filter @ipe-gov/web run dev
pnpm --filter @ipe-gov/pin-api run dev
pnpm --filter @ipe-gov/paymaster-proxy run dev
pnpm --filter @ipe-gov/contracts run compile
```

## Deployment

| Package                | Target             |
| ---------------------- | ------------------ |
| `apps/web`             | Cloudflare Pages   |
| `apps/pin-api`         | Cloudflare Workers |
| `apps/paymaster-proxy` | Cloudflare Workers |
| `packages/contracts`   | Sepolia (Hardhat)  |

Worker secrets are set with `wrangler secret put <NAME>`; local-dev secrets live in each worker's `.dev.vars`
(gitignored). CI/CD is not yet wired up.

## Key dependencies

- **Unlock Protocol** — membership gate (`PublicLock.getHasValidKey`)
- **Zama FHEVM** — encrypted vote tallies (`@fhevm/solidity`, `@zama-fhe/relayer-sdk`)
- **Pimlico** — ERC-4337 bundler + paymaster
- **Pinata** — IPFS pinning
- **TanStack Start / Router / Query** — frontend metaframework + routing + data
- **RainbowKit / wagmi / viem** — wallet UX + Ethereum client
- **Hono** — Cloudflare Workers framework
- **Turborepo + pnpm workspaces** — monorepo build orchestration
