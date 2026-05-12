# `@ipe-gov/starter`

A blank canvas with the ipe-gov plumbing pre-wired. Fork it, build whatever
you want.

## What's wired

- **Auth**: Privy (email, social, embedded wallet on first login).
- **Wallet**: wagmi via `@privy-io/wagmi`, chains Sepolia / Base / Mainnet.
- **RPC**: all chains route through `paymaster-proxy` by chainId — no node URL in the bundle.
- **Membership gate**: `useMembership(address)` reads `PublicLock.getHasValidKey` on Sepolia. The header shows the live status.
- **Sponsored writes**: `useSponsoredWrite()` submits contract calls members don't pay gas for. Handles both EIP-5792 wallets and EIP-7702 + ERC-4337 fallback.
- **Routing**: TanStack Router file-based — drop a file in `src/routes/`, it becomes a route.
- **Styling**: Tailwind v4 + shadcn `new-york` / zinc. `components.json` is configured.

## Pre-installed packages

Everything you need to rebuild the full governance app is already in the dependency tree:

- `@ipe-gov/sdk` — contract addresses, ABIs, signed-message builders.
- `@ipe-gov/eas` — on-chain credential schemas + codec (EAS attestations).
- `@ipe-gov/ipfs` — Pinata + gateway helpers.
- `@zama-fhe/relayer-sdk` — FHE encryption for confidential ballots.
- `permissionless` — ERC-4337 / EIP-7702 smart-account plumbing under `useSponsoredWrite`.

Just `import` and use.

## Bootstrap

Clone the whole monorepo — you get every example, every shared package, and
the reference governance app to learn from:

```bash
git clone https://github.com/MihkelJ/ipe-gov.git
cd ipe-gov
pnpm install
pnpm --filter @ipe-gov/starter dev
```

Open <http://localhost:3000>. Sign-in works out of the box with the shared
community Privy app — no signup required. When you ship for real, grab your
own (free) at <https://dashboard.privy.io> and swap the `VITE_PRIVY_APP_ID`
in `apps/starter/.env.local`.

> **Why the whole repo?** `apps/web` is a full working reference (FHE
> voting, governance, member directory, ENS claims). `packages/*` is the
> shared SDK every app uses. Having both on disk means AI coding tools
> (Cursor, Claude Code, etc.) can read the patterns when helping you build.

## Spin up your own app

When you're ready to start something new, one command scaffolds it from this
starter:

```bash
pnpm new-app bookclub
```

That creates `apps/bookclub/` with the package renamed to `@ipe-gov/bookclub`
and a free dev port picked automatically. Then:

```bash
pnpm install
pnpm --filter @ipe-gov/bookclub dev
```

Edit `apps/bookclub/src/routes/index.tsx`, build your idea, open a PR.

Run `pnpm new-app` with no arguments and it'll prompt you for a name.

## Add more shadcn components as you need them

```bash
pnpm dlx shadcn@latest add dialog dropdown-menu sheet tabs tooltip
```

## Where to look beyond the starter

For the full eight-layer reference composed end-to-end — proposals, FHE
voting, governance UI, member directory, ENS subname claims, EAS
attestations — see `apps/web` in the parent monorepo.

## Conventions

- Never inline contract addresses or ABIs — import from `@ipe-gov/sdk`.
- Worker secrets via `wrangler secret put`, never `vars` in `wrangler.jsonc`.
- Signed messages for community workers live in `@ipe-gov/sdk` — the bytes the wallet signs MUST be the bytes the worker recovers.

## Caveats

- Workspace-only today. If you `degit` out of the monorepo, you'll need to wait for the `@ipe-gov/*` packages to be published or vendor them.
- No deploy script — pick a host (Vercel, Cloudflare Pages, Netlify) when you ship.

## License

MIT — same as the parent repo.
