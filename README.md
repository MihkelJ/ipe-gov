# ipe-gov

> **A protocol recommendation for [docs.ipe.city](https://docs.ipe.city/).**
> Ten primitives, picked deliberately, integrated end-to-end, and running on
> Sepolia today. This is the stack we think every network city should adopt —
> and the working proof that they fit together.

Ipê (and every village like it) needs the same plumbing: *who is a member,
how do we decide, how do we remember what happened.* Each of those questions
has dozens of plausible answers. This repo is our argument for which ten to
standardize on, and a reference implementation you can read, run, and fork.

---

## Why standardize at all?

The 2020s produced two parallel experiments:

1. **Network states & pop-up cities** — Próspera, Zuzalu, Cabin, Vitalia,
   Edge City, Aleph, Network School. Real residents, real charters, real
   coordination problems.
2. **Credible-neutral crypto primitives** — FHE, account abstraction, ENS,
   EAS, Unlock, on-chain governance. Audited, public-good, ownerless.

The first group keeps reinventing the second group's plumbing — usually
badly, usually with Google Forms, usually with the founders' wallet as the
ledger-of-record.

If the next decade has a hundred network cities, **they shouldn't each
rebuild the ballot box.** A shared protocol stack means:

- A resident's EAS attestations follow them from Ipê to the next city.
- An ENS subname is recognized everywhere, not just on one Discord.
- Confidential governance is a dependency you import, not a project you
  staff.
- Audits, bug-bounty surface, and tooling compound across the ecosystem
  instead of fragmenting per-city.

---

## The eight layers

A network-city governance stack should answer eight questions, each at its
own layer, each with one canonical primitive. Stacked from the user-facing
top down to settlement at the bottom:

```
┌────────────────────────────────────────────────────────────────────────┐
│  L8 · Identity        What is this person called?                       │
│         → ENS + NameWrapper                                             │
├────────────────────────────────────────────────────────────────────────┤
│  L7 · Provenance      What have they done?                              │
│         → EAS  (IpeResident · IpeCheckin · IpeRole · IpeProject ·       │
│                 IpeSkill)                                               │
├────────────────────────────────────────────────────────────────────────┤
│  L6 · Confidentiality & Privacy   How do their choices stay private?    │
│         → Zama fhEVM  (FHE-encrypted ballots, aggregate-only decrypt)   │
├────────────────────────────────────────────────────────────────────────┤
│  L5 · Governance      How do decisions move?                            │
│         → OpenZeppelin Governor  +  Liquid Delegation                   │
├────────────────────────────────────────────────────────────────────────┤
│  L4 · Membership      Who is allowed?                                   │
│         → Unlock Protocol  (non-transferable ERC-721 keys)              │
├────────────────────────────────────────────────────────────────────────┤
│  L3 · Access          How do they transact?                             │
│         → Privy  +  ERC-4337  +  EIP-7702  (Pimlico)                    │
├────────────────────────────────────────────────────────────────────────┤
│  L2 · Content         Where do long documents live?                     │
│         → IPFS (Pinata)                                                 │
├────────────────────────────────────────────────────────────────────────┤
│  L1 · Settlement      Where is state final?                             │
│         → Ethereum  (Sepolia pilot → mainnet or L2 in production)       │
└────────────────────────────────────────────────────────────────────────┘
```

Each layer can be adopted independently. Each layer has exactly one
recommendation. **No bespoke cryptography, no vendor lock-in beyond
swappable hosted providers (Pinata, Pimlico, Privy).**

### Per-layer justification

| Layer | Pick                          | Why this and not the alternative                                                |
| ----- | ----------------------------- | ------------------------------------------------------------------------------- |
| **L8 · Identity**       | **ENS + NameWrapper**         | A name, on L1, that travels with the holder. Beats Discord handles and SBTs that nobody renders. |
| **L7 · Provenance**     | **EAS**                       | Schema'd, revocable, queryable, portable across cities. Beats bespoke databases and Notion exports. |
| **L6 · Confidentiality & Privacy** | **Zama fhEVM** | True FHE — ballots stay sealed end-to-end, only the aggregate is ever decrypted. Beats commit-reveal (coercible) and ZK ballots (heavier client cost, harder UX). |
| **L5 · Governance**     | **OpenZeppelin Governor + Liquid Delegation** | The most-audited governance contract in production, plus per-proposal liquid delegation. Beats roll-your-own, Tally-only flows, and sticky ERC-20 delegation. |
| **L4 · Membership**     | **Unlock Protocol**           | Non-transferable ERC-721 keys. Beats Snapshot allowlists (off-chain, mutable) and ERC-20 voting (speculation, whales). |
| **L3 · Access**         | **Privy + ERC-4337 + EIP-7702** | Email/social → embedded wallet → sponsored gas, gated by membership. Beats walletconnect-only and "we'll airdrop gas". |
| **L2 · Content**        | **IPFS (Pinata)**             | The ledger keeps the hash; the network keeps the bytes. Beats centralized blob stores. |
| **L1 · Settlement**     | **Ethereum**                  | Sepolia for the pilot; mainnet or your favorite L2 once the institution is permanent. |

### How the layers compose

- **A vote is L4 → L5 → L6 → L2 → L1**: an Unlock-key holder (L4) calls the
  Governor (L5) with an FHE-encrypted ballot (L6); the proposal body lives
  on IPFS (L2); the result settles on Ethereum (L1).
- **Joining a city is L3 → L4 → L8 → L7**: Privy onboards the user with
  sponsored gas (L3); they claim an Unlock key (L4); they wrap an ENS
  subname (L8); their residency is recorded as an EAS attestation (L7).
- **A skill record is L7 alone**: an EAS `IpeSkill` attestation is portable
  across cities even if the holder leaves Ipê — provenance survives
  membership.

---

## What adoption looks like for ipe.city

If [docs.ipe.city](https://docs.ipe.city/) takes this stack as canonical,
**the table of contents writes itself — one section per layer:**

| Docs section          | Layer                  | Points at                                                |
| --------------------- | ---------------------- | -------------------------------------------------------- |
| **Identity**          | L8                     | ENS subnames under a city-owned parent → "claim your `*.ipecity.eth`" |
| **Provenance**        | L7                     | The five EAS schemas in `@ipe-gov/eas` → "your role history is portable, here's the SDK" |
| **Voting**            | L6 + L5                | This contract set → "ballots are FHE-encrypted, here's how the math works, here's the audit" |
| **Membership**        | L4                     | Unlock → "your residency is an Unlock key, here's how to claim one" |
| **Onboarding**        | L3                     | Privy + sponsored gas → "no ETH required, email is enough" |
| **Content & storage** | L2                     | IPFS envelope format → "this is how a proposal body is shaped" |
| **Chain**             | L1                     | Sepolia today, mainnet/L2 tomorrow                        |

Every doc page becomes a thin pointer to a working primitive at a known
layer, instead of a spec to be reimplemented. The five EAS schemas in
`@ipe-gov/eas` are already the right granularity for the city's identity
surface — name them, register them under the city's address, and the docs
write themselves around them.

---

## Adopting the stack — by layer

You don't have to take all eight layers at once. Each is independently
useful; the higher layers depend only on the lower ones being present.

| Adoption path                       | Layers          | What you get                                                            |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------- |
| **Identity-only**                   | L1 + L2 + L7 + L8 | Named members + portable EAS attestations. No on-chain voting yet. Use `@ipe-gov/eas` + `apps/ens-api`. |
| **+ Membership**                    | add L4          | Now attestations have a real residency predicate. Still no governance. |
| **+ Access**                        | add L3          | Members onboard with email and transact without holding ETH.          |
| **Full governance**                 | add L5 + L6     | Deploy `UnlockConfidentialGovernorLiquid` against your Lock; register schemas; run the three workers. The whole institution. |
| **Production migration**            | swap L1         | Sepolia → mainnet (or your L2). Contracts, schemas, and worker abstractions don't change — update the address book in `@ipe-gov/sdk`; ship. |

---

## Design principles

1. **Public-good primitives over bespoke cryptography.** Every protocol in
   the stack is audited, open-source, and used in production by someone
   else.
2. **Off-chain hops verify membership.** Workers are gates, not trust roots.
   Every privileged action checks `PublicLock.getHasValidKey` before doing
   work.
3. **One source of truth.** Addresses, ABIs, schema UIDs live in
   `@ipe-gov/sdk` and `@ipe-gov/eas`. Apps and workers import; they never
   inline.
4. **The institution should outlive the pilot.** Sepolia is a learning
   environment. The contracts, schemas, and key abstractions are designed to
   port to mainnet (or an L2) — and to other cities — without rewriting the
   village.

---

## Status

Live on **Sepolia**. Ipê is the first instance. Recommending this stack to
[docs.ipe.city](https://docs.ipe.city/) and any network city that wants
confidential governance, portable identity, and an onboarding flow that
doesn't gatekeep.

> *"A village runs on what its members can keep to themselves — and what
> they choose to count together."*
> — Charter, §1

---
---

# What's in this repo

The pitch above is concrete because every layer is already shipped. This
section is the lay of the land: the SDKs you can import, the public services
the community already runs, and how the monorepo is organized.

## SDKs and apps

A working pilot of the full stack on Sepolia, plus the SDKs needed to
integrate any of it independently:

- **`@ipe-gov/contracts`** — `UnlockConfidentialGovernorLiquid` (Governor
  variant wired to Unlock as the vote source) and `LiquidDelegation`. Drop in
  your Lock address; you have a confidential governance system.
- **`@ipe-gov/eas`** — Five Ipê EAS schemas with codecs and Sepolia
  registration scripts. Rename them to your city; keep the shape.
- **`@ipe-gov/sdk`** — Single source of truth for addresses and ABIs.
- **`@ipe-gov/ipfs`** — Shared envelope format and Pinata helpers.
- **`@ipe-gov/workers-shared`** — Hono middleware (CORS, signature
  verification, error shapes) for the worker pattern.
- **`apps/web`** — Reference frontend (Vite + TanStack Router + Privy +
  wagmi). Encrypts ballots client-side with the FHEVM SDK.
- **`apps/pin-api`** — Worker that signature-gates IPFS pinning.
- **`apps/paymaster-proxy`** — Worker that gates ERC-4337 sponsorship by
  Unlock key + chain-aware RPC proxy.
- **`apps/ens-api`** — Worker that issues wrapped ENS subnames on L1.

---

## Public services

The pilot is live. These are **public, community-run endpoints** — any
network-city app, bot, or integration can use them today without spinning up
its own infrastructure. They share the same gating rules: every privileged
call verifies the caller holds a valid Unlock key on Sepolia.

| Service                | URL                                                             | What it does                                                            |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Web app** (L8 → L1)  | Cloudflare Pages — `ipe-gov-web`                                | The reference frontend. Encrypts ballots client-side, talks to the workers below. |
| **pin-api** (L2)       | `https://ipe-gov-pin-api.ipe-gov.workers.dev`                   | Signature-gated IPFS pinning for proposal bodies. Sign a timestamped message; get a CID back. |
| **paymaster-proxy** (L3) | `https://ipe-gov-paymaster-proxy.ipe-gov.workers.dev/rpc`     | ERC-4337 / ERC-7677 endpoint that gates Pimlico sponsorship by Unlock-key holdership. Doubles as a chain-aware RPC proxy. |
| **ens-api** (L8)       | `https://ipe-gov-ens-api.ipe-gov.workers.dev`                   | Issues wrapped ENS subnames under `govdemo.eth` on L1 mainnet. |
| **Sepolia contracts** (L5 + L6) | Addresses in `@ipe-gov/sdk`                            | `UnlockConfidentialGovernorLiquid`, `LiquidDelegation`, the Unlock `PublicLock`. |
| **EAS schemas** (L7)   | UIDs in `@ipe-gov/eas` (registered on Sepolia)                  | `IpeResident`, `IpeCheckin`, `IpeRole`, `IpeProjectLaunched`, `IpeSkill`. |

If you're integrating from another app, you only need `@ipe-gov/sdk` +
`@ipe-gov/eas` — both packages re-export the live addresses, ABIs, and
schema UIDs so the public services above are a `npm install` away.

---

## Monorepo layout

```
ipe-gov/
├── apps/
│   ├── web/               # Vite + TanStack Router frontend (Cloudflare Pages)
│   ├── pin-api/           # Worker: signature-gated IPFS pinning
│   ├── paymaster-proxy/   # Worker: ERC-7677 paymaster + chain-aware RPC proxy
│   └── ens-api/           # Worker: wrapped ENS subname issuance
├── packages/
│   ├── contracts/         # Hardhat + FHEVM governor, liquid delegation, deploy scripts
│   ├── sdk/               # Shared addresses, ABIs, helpers (single source of truth)
│   ├── eas/               # EAS schema definitions, codecs, Sepolia registration
│   ├── ipfs/              # IPFS pin/fetch helpers (web + pin-api)
│   └── workers-shared/    # Hono middleware + helpers shared across workers
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### Package responsibilities

- **contracts** — `UnlockConfidentialGovernorLiquid` checks the caller holds
  a valid Unlock key, stores proposal metadata (IPFS CID + target calls +
  per-proposal voting window), and accumulates encrypted vote tallies as
  `euint32` via FHEVM. `LiquidDelegation` lets members delegate per proposal
  — the delegation graph is public; individual votes stay encrypted.
- **sdk** — Re-exports compiled ABIs, deployed addresses, and shared helpers
  (e.g. `paymasterProxyRpcUrl`). **Never inline addresses or ABIs in app or
  worker code** — import from `@ipe-gov/sdk`.
- **eas** — Source of truth for the Ipê EAS schemas plus Hardhat scripts to
  register them on Sepolia. Apps consume schema UIDs and codecs from
  `@ipe-gov/eas`.
- **pin-api** — Browser can't hold a Pinata JWT. Client signs a timestamped
  message; worker verifies signature + Unlock key, pins the JSON, returns
  the CID. The CID goes on-chain with the proposal.
- **paymaster-proxy** — ERC-4337 / ERC-7677 JSON-RPC endpoint. Verifies
  `userOp.sender` holds a valid Unlock key before forwarding to Pimlico.
  Doubles as a chain-aware RPC proxy used by other workers and the web app.
- **ens-api** — Issues wrapped ENS subnames on L1. Holds an operator key
  with `setApprovalForAll` on the parent name and records each claim in a KV
  namespace. Mainnet RPC routes through `paymaster-proxy`.
- **workers-shared** — Hono middleware (CORS, signature verification, error
  shapes). Workers import from here; **workers do not re-export library
  code** to other workers — share helpers via this package.
- **web** — Vite + TanStack Router with Privy + wagmi. Talks to
  `VITE_PIN_API_URL`, `VITE_PAYMASTER_PROXY_URL`, and `VITE_ENS_API_URL`.
- **ipfs** — Shared envelope format (`version`, `kind`, `proposer`,
  `createdAt`, `text`) plus Pinata pinning and gateway fetch helpers.

---
---

# The example web app

`apps/web` is a reference implementation, not the product. It's there to
prove the eight-layer stack composes end-to-end and to give cities a working
template they can fork or replace. Everything below describes that specific
app — its UX flow, its wiring, and how to run or deploy it.

## How a ballot moves (in the reference app)

```
01  YOU CHOOSE          Yes / No / Abstain, locally          [plain]
02  WE SEAL             Encrypted in your browser            [sealed]
03  CHAIN SUMS          Ciphertexts add without opening      [sealed]
04  TOTAL REVEALED      Only the aggregate is decrypted      [plain]
```

Steps **02** and **03** are mathematically opaque, by construction. The vote
happened; your choice did not leak. Holds whether your city has 30 residents
or 30,000.

---

## Architecture

```
                   ┌──────────────────────────────────────────────┐
                   │           apps/web  (Cloudflare Pages)        │
                   │   Vite · TanStack Router · Privy · wagmi      │
                   │  Encrypts ballots client-side with FHEVM SDK  │
                   └──────┬─────────────┬───────────────┬─────────┘
                          │             │               │
            ┌─────────────▼──┐  ┌───────▼──────┐  ┌─────▼──────────┐
            │ pin-api        │  │ paymaster-   │  │ ens-api        │
            │ Worker         │  │ proxy Worker │  │ Worker (L1)    │
            │ Sig-gated      │  │ ERC-7677 +   │  │ Wraps subnames │
            │ IPFS pinning   │  │ RPC proxy    │  │ under govdemo  │
            └────────┬───────┘  └──────┬───────┘  └────────┬───────┘
                     │ CID             │ UserOp / RPC      │ NameWrapper
                     ▼                 ▼                   ▼
            ┌────────────────────────────────────────────────────┐
            │  Ethereum Sepolia (pilot) · L1 mainnet (ENS only)  │
            │                                                    │
            │  UnlockConfidentialGovernorLiquid (FHEVM)          │
            │  LiquidDelegation                                  │
            │  PublicLock (Unlock)   EAS schemas (5)             │
            └────────────────────────────────────────────────────┘
```

Pinata, Pimlico, and the operator key for ENS issuance never touch the
browser. Every privileged action checks `PublicLock.getHasValidKey` before
doing work — workers are **gates, not trust roots.**

---

## Run it locally

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 10

### Install

```bash
pnpm install
```

### Environment

Each app has a template; copy and fill in:

```bash
cp apps/web/.env.example                  apps/web/.env.local
cp apps/pin-api/.dev.vars.example         apps/pin-api/.dev.vars
cp apps/paymaster-proxy/.dev.vars.example apps/paymaster-proxy/.dev.vars
cp apps/ens-api/.dev.vars.example         apps/ens-api/.dev.vars
cp packages/contracts/.env.example        packages/contracts/.env
```

Hardhat prefers its vault over `.env`:

```bash
cd packages/contracts
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npx hardhat vars set ETHERSCAN_API_KEY   # optional, for verification
```

**Worker secrets** — production values for every Cloudflare Worker
(sensitive or not) go through `wrangler secret put <NAME>`, never `vars` in
`wrangler.jsonc`. Local-dev secrets live in each worker's `.dev.vars`
(gitignored).

### Common commands

```bash
pnpm dev              # run every package's dev task in parallel
pnpm build            # build every package
pnpm compile          # compile contracts + export ABIs to the sdk
pnpm test             # run contract tests
pnpm deploy:sepolia   # deploy contracts to Sepolia
```

Scoped to one package:

```bash
pnpm --filter @ipe-gov/web                 run dev
pnpm --filter @ipe-gov/pin-api             run dev
pnpm --filter @ipe-gov/paymaster-proxy     run dev
pnpm --filter @ipe-gov/ens-api             run dev
pnpm --filter @ipe-gov/contracts           run compile
pnpm --filter @ipe-gov/eas                 run register-schemas:sepolia
```

Always scope worker deploys to a single app — never run `wrangler deploy`
from an ambiguous cwd:

```bash
pnpm --filter @ipe-gov/pin-api         run deploy
pnpm --filter @ipe-gov/paymaster-proxy run deploy
pnpm --filter @ipe-gov/ens-api         run deploy
```

---

## Deployment targets

| Package                | Target                              |
| ---------------------- | ----------------------------------- |
| `apps/web`             | Cloudflare Pages                    |
| `apps/pin-api`         | Cloudflare Workers                  |
| `apps/paymaster-proxy` | Cloudflare Workers                  |
| `apps/ens-api`         | Cloudflare Workers                  |
| `packages/contracts`   | Sepolia (Hardhat)                   |
| `packages/eas`         | Sepolia (Hardhat — schema registry) |

CI/CD is not yet wired up.
