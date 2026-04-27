import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPublicClient, http, namehash, type Address } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import { fetchAllSubnameIdentities } from "#/lib/ensApi";

const DAY = 1000 * 60 * 60 * 24;
const CLAIMED_KEY = ["l2-subname-identities"] as const;
const IPECITY_KEY = ["ipecity-subnames"] as const;
const IPECITY_PARENT = "ipecity.eth";
// ENS legacy hosted subgraph — deprecated June 2024 but still indexing
// mainnet blocks and serving queries without an API key. Used as a
// best-effort source for `*.ipecity.eth` display names so existing holders
// keep their identity even though new claims are issued on govdemo.eth.
const ENS_SUBGRAPH_URL = "https://api.thegraph.com/subgraphs/name/ensdomains/ens";
// Registrar events don't change on the minute-scale; a 10-minute cache is
// enough to deduplicate bursts from the members page without delaying fresh
// claims by more than a single stale window.
const CLAIMED_STALE_MS = 1000 * 60 * 10;

// Standalone mainnet client: wagmi is Sepolia-only, ENS lives on L1.
// `batch.multicall` coalesces concurrent eth_calls (getEnsName, getEnsAvatar,
// getEnsText) into a single Multicall3 request — members page fires N lookups
// in parallel, so this drops N RPCs down to 1 per ~16ms tick.
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.nodereal.io/v1/1659dfb40aa24bbb8153a677b98064d7"),
  batch: { multicall: true },
});

/** Resolve a display name for an address. Precedence:
 *  1. Active govdemo subname under the configured parent (via ens-api KV).
 *  2. Legacy `*.ipecity.eth` wrapped subname (via ENS subgraph).
 *  3. Mainnet ENS primary name (reverse resolution).
 *  4. `null` — caller falls back to a truncated hex address.
 *
 *  Both subname maps are shared via tanstack-query keys so a members-page
 *  render that probes N addresses issues one fetch per source. */
export function useIdentity(address: Address | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["identity", address?.toLowerCase()],
    enabled: !!address,
    staleTime: DAY,
    gcTime: DAY * 7,
    queryFn: async (): Promise<string | null> => {
      const lower = address!.toLowerCase();

      const claimed = await queryClient.fetchQuery({
        queryKey: CLAIMED_KEY,
        staleTime: CLAIMED_STALE_MS,
        queryFn: () => fetchClaimedMap(),
      });
      const fullName = claimed.get(lower);
      if (fullName) return fullName;

      const ipecity = await queryClient.fetchQuery({
        queryKey: IPECITY_KEY,
        staleTime: CLAIMED_STALE_MS,
        queryFn: () => fetchIpecitySubnames(),
      });
      const ipe = ipecity.get(lower);
      if (ipe) return ipe;

      try {
        return (await ensClient.getEnsName({ address: address! })) ?? null;
      } catch {
        // The public mainnet RPC sometimes rate-limits; returning null lets
        // callers fall back to a truncated address instead of spinning.
        return null;
      }
    },
  });
}

/** Map of live L2 subname claims under the configured parent: `address` →
 *  `fullName` (e.g. "alice.govdemo.eth"). Shared with `useIdentity` via the
 *  `l2-subname-identities` query key so there's only ever one network fetch
 *  backing both per cache window. */
export function useClaimedSubnames() {
  return useQuery({
    queryKey: CLAIMED_KEY,
    staleTime: CLAIMED_STALE_MS,
    gcTime: DAY,
    queryFn: () => fetchClaimedMap(),
  });
}

/** Map of legacy `*.ipecity.eth` wrapped subname owners: `address` →
 *  `fullName` (e.g. "alice.ipecity.eth"). Shared with `useIdentity` via the
 *  `ipecity-subnames` query key. Useful for callers that need to search or
 *  filter members by display name without paying for N reverse-resolution
 *  RPCs upfront. */
export function useIpecitySubnames() {
  return useQuery({
    queryKey: IPECITY_KEY,
    staleTime: CLAIMED_STALE_MS,
    gcTime: DAY,
    queryFn: () => fetchIpecitySubnames(),
  });
}

/** Resolves the ENS `avatar` text record for a name to a usable image URL.
 *  Handles IPFS, NFT (eip155) and HTTP avatars via viem's built-in parser.
 *  One RPC per distinct name; cached for a day.
 *
 *  Note: this only resolves mainnet avatars. L2 subname avatars live on the
 *  Base registry; callers that need them should read the `avatar` text
 *  record directly off the registry for now. */
export function useEnsAvatar(name: string | null | undefined) {
  return useQuery({
    queryKey: ["ens-avatar", name],
    enabled: !!name,
    staleTime: DAY,
    gcTime: DAY * 7,
    queryFn: async (): Promise<string | null> => {
      try {
        return (await ensClient.getEnsAvatar({ name: normalize(name!) })) ?? null;
      } catch {
        return null;
      }
    },
  });
}

async function fetchClaimedMap(): Promise<Map<string, string>> {
  const identities = await fetchAllSubnameIdentities();
  const map = new Map<string, string>();
  for (const i of identities) {
    map.set(i.address.toLowerCase(), i.fullName);
  }
  return map;
}

type IpecityDomainRow = {
  name: string | null;
  wrappedOwner: { id: string } | null;
};

/** Fetches all wrapped `*.ipecity.eth` subnames in one subgraph round trip.
 *  Pre-pilot members were issued under this parent; querying the subgraph
 *  keeps them visible without us having to backfill them into the
 *  govdemo.eth registry. Best-effort: a subgraph outage falls through to
 *  ENS reverse resolution. */
async function fetchIpecitySubnames(): Promise<Map<string, string>> {
  try {
    const res = await fetch(ENS_SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: /* GraphQL */ `
          query Subnames($parent: String!) {
            domains(first: 1000, where: { parent: $parent, wrappedOwner_not: null }) {
              name
              wrappedOwner {
                id
              }
            }
          }
        `,
        variables: { parent: namehash(IPECITY_PARENT) },
      }),
    });
    if (!res.ok) return new Map();
    const json = (await res.json()) as {
      data?: { domains: IpecityDomainRow[] };
      errors?: { message: string }[];
    };
    if (json.errors?.length) return new Map();
    const map = new Map<string, string>();
    for (const d of json.data?.domains ?? []) {
      const owner = d.wrappedOwner?.id?.toLowerCase();
      if (owner && d.name) map.set(owner, d.name);
    }
    return map;
  } catch {
    return new Map();
  }
}
