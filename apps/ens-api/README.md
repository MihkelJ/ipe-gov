# @ipe-gov/ens-api

Cloudflare Worker that issues L1 wrapped-ENS subnames under `govdemo.eth`
(or whichever parent is configured) on behalf of verified Unlock Protocol
members. Acts as the registrar — checks membership on Sepolia, then mints
the subname onchain via NameWrapper from a hot operator wallet. Members own
real ERC-1155 tokens after mint and never pay gas to claim.

## Endpoints

- `GET /ens/available?label=alice` — label shape + `NameWrapper.ownerOf` collision check.
- `POST /ens/claim` — wallet-signed request; verifies Unlock membership, mints `<label>.<parent>` via `NameWrapper.setSubnodeRecord` from the operator wallet, persists the claim record to KV.
- `GET /ens/identity/:address` — single-address lookup from KV with on-chain ownership re-check.
- `GET /ens/identities` — bulk listing for member search / delegation pickers.

## Bindings

Secrets (`pnpm dlx wrangler secret put <NAME>`):

| name | what |
| --- | --- |
| `SEPOLIA_RPC_URL` | RPC for the Unlock membership read. |
| `MAINNET_RPC_URL` | Paymaster-proxy `/rpc/1` URL — handles both reads and sponsored UserOp submission. |
| `MAINNET_OPERATOR_KEY` | 0x-prefixed private key of the wallet that holds `setApprovalForAll(true)` on the parent. Doesn't need an ETH balance — gas is paid by Pimlico via the paymaster-proxy. The derived address MUST be in the proxy's `OPERATOR_ALLOWLIST_1`. **Hot key — revoke approval if leaked.** |
| `ENS_PARENT_NAME` | Parent name (e.g. `govdemo.eth`). |
| `ALLOWED_ORIGINS` | (Optional) Comma-separated CORS allowlist; defaults to `*`. |

KV namespace (declared in `wrangler.jsonc`):

| binding | what |
| --- | --- |
| `IDENTITIES` | Stores the issued-claims log under key `claims:all` (single JSON list). The worker is the only writer; concurrent claims serialize at the wallet's nonce. |

### Why KV?

NameWrapper indexes subnames by `namehash(label.parent)`, which is one-way — there's no on-chain way to ask "given this address, what label did we issue them?". The web app needs that reverse lookup to render the member roster and to populate delegation/co-author search. Alternatives are scanning `NameWrapped` events on every read (slow, RPC-rate-limited) or reverse resolution via primary names (requires each member to set one with an extra mainnet tx). KV is just our authoritative cache of "who claimed what"; the on-chain mint is still source of truth, and `/ens/identity` re-checks `ownerOf` so a transferred-away NFT doesn't keep showing the old holder.

## Local dev

```bash
cp apps/ens-api/.dev.vars.example apps/ens-api/.dev.vars
# fill in secrets
pnpm --filter @ipe-gov/ens-api dev
# Worker on http://localhost:8787
```

---

# Pilot runbook (`govdemo.eth`)

## One-time setup

### 1. Wrap `govdemo.eth` on mainnet

In [ENS Manager](https://app.ens.domains): open `govdemo.eth` → **More → Wrap name**. ~$0.20 at current gas. The name becomes ERC-1155 token id `uint256(namehash("govdemo.eth"))` at `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`.

### 2. Set resolver to ENS Public Resolver

In ENS Manager → `govdemo.eth` → **Records → Edit → Resolver** → set to:

```
0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63
```

This is the resolver the worker points new subnames at, and the contract members will write text records to. ~$0.05.

### 3. Generate the operator hot wallet

```
! cast wallet new
```

(or any wallet generator you trust). Save both the address and the private key. Treat the private key as sensitive — it controls subname issuance for as long as the approval is granted.

### 4. Approve the operator on NameWrapper

From the wallet that owns `govdemo.eth` (post-wrap), call:

```
NameWrapper.setApprovalForAll(<hotWalletAddress>, true)
```

Easiest way: open Etherscan → NameWrapper → Write Contract → connect owner wallet → fill `setApprovalForAll(operator=<hot>, approved=true)`. ~$0.10.

### 5. Allowlist the hot wallet on the paymaster-proxy

The wallet doesn't need ETH — every mint is a sponsored UserOp routed through `apps/paymaster-proxy` to Pimlico. The proxy's policy bypasses the Unlock-membership check for senders in `OPERATOR_ALLOWLIST_1`, so the operator address has to land there:

```
! cast wallet address $MAINNET_OPERATOR_KEY   # or read from your password manager
! pnpm --filter @ipe-gov/paymaster-proxy exec wrangler secret put OPERATOR_ALLOWLIST_1
# paste the operator address (lowercase). Multiple addresses comma-separated.
```

Pimlico funding lives on the paymaster-proxy's API key — top up via the Pimlico dashboard, not this wallet.

### 6. Create the KV namespace

```
! pnpm --filter @ipe-gov/ens-api exec wrangler kv namespace create IDENTITIES
```

Wrangler prints an `id`. Open `apps/ens-api/wrangler.jsonc` and replace `REPLACE_WITH_KV_NAMESPACE_ID` with that id. (Namespace ids aren't sensitive — committing to source is fine.)

### 7. Set worker secrets

```
! pnpm --filter @ipe-gov/ens-api exec wrangler secret put SEPOLIA_RPC_URL
! pnpm --filter @ipe-gov/ens-api exec wrangler secret put MAINNET_RPC_URL
! pnpm --filter @ipe-gov/ens-api exec wrangler secret put MAINNET_OPERATOR_KEY
! pnpm --filter @ipe-gov/ens-api exec wrangler secret put ENS_PARENT_NAME
```

(Paste each value at the prompt. `ENS_PARENT_NAME` is `govdemo.eth` for the pilot.)

### 8. Deploy

```
! pnpm --filter @ipe-gov/ens-api run deploy
```

### 9. Point the web app at the new worker

`apps/web/.env.local`:

```
VITE_ENS_API_URL=https://ipe-gov-ens-api.ipe-gov.workers.dev
VITE_MAINNET_RPC_URL=<your mainnet rpc>
```

## Verification checklist

1. Connect a wallet with a valid Unlock key on Sepolia, visit `/profile`.
2. Type a label. Availability hint flips between idle → loading → available.
3. Click **Claim** — wallet prompts a single `personal_sign`. Worker mints onchain, returns a tx hash. Page flips to the profile editor showing `<label>.govdemo.eth`.
4. Profile editor pre-fills from existing PublicResolver records. Set `avatar`, `description`, etc. Click **Save** — wallet switches to mainnet, signs a single PublicResolver `multicall` tx (or `setText` for a single field). ~$0.02–0.05 paid by the member.
5. Resolve `<label>.govdemo.eth` in [ENS Manager](https://app.ens.domains). Verify ETH address resolves to the claiming wallet and text records match what was saved.
6. `/members` page — claimed subname appears in the row for the claiming wallet.

## Operational notes

- **Key rotation:** if `MAINNET_OPERATOR_KEY` is suspected leaked, do two things in parallel: (a) call `NameWrapper.setApprovalForAll(<oldHotWallet>, false)` from the owner wallet to stop further mints, and (b) remove the address from the proxy's `OPERATOR_ALLOWLIST_1` so even a leaked key can't burn Pimlico credits. Then mint a new key, re-approve on NameWrapper, and re-add to the allowlist.
- **Spam mints:** if attackers mint junk subnames before approval revocation, those NFTs exist permanently but don't affect resolution of legitimate names. The worker's `claims:all` KV log only tracks worker-issued mints, so identity lookups still work.
- **Member-side records:** records edits are direct member→PublicResolver writes; the worker isn't in the path. If a member loses their wallet they can't edit records, but the parent owner can still revoke / re-issue the subname (fuses are unburned).
- **Pimlico cost:** every mint is a sponsored UserOp; budget is the proxy's Pimlico account. At current mainnet gas (≈0.15 gwei) a mint is ~$0.10 including Pimlico's flat per-UserOp overhead. Set up Pimlico spend alerts so a runaway loop is caught before the budget bottoms out.
