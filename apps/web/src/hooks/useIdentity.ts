import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPublicClient, http, type Address } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import { fetchAllSubnameIdentities } from '#/lib/ensApi'

const DAY = 1000 * 60 * 60 * 24
const CLAIMED_KEY = ['l2-subname-identities'] as const
// Registrar events don't change on the minute-scale; a 10-minute cache is
// enough to deduplicate bursts from the members page without delaying fresh
// claims by more than a single stale window.
const CLAIMED_STALE_MS = 1000 * 60 * 10

// Standalone mainnet client: wagmi is Sepolia-only, ENS lives on L1.
// `batch.multicall` coalesces concurrent eth_calls (getEnsName, getEnsAvatar,
// getEnsText) into a single Multicall3 request — members page fires N lookups
// in parallel, so this drops N RPCs down to 1 per ~16ms tick.
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://eth-mainnet.nodereal.io/v1/1659dfb40aa24bbb8153a677b98064d7'),
  batch: { multicall: true },
})

/** Resolve a display name for an address. Precedence:
 *  1. Active L2 subname under the configured parent (via ens-api).
 *  2. Mainnet ENS primary name (reverse resolution).
 *  3. `null` — caller falls back to a truncated hex address.
 *
 *  The L2 lookup goes through the shared `l2-subname-identities` query so a
 *  members-page render that probes N addresses still issues a single fetch. */
export function useIdentity(address: Address | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['identity', address?.toLowerCase()],
    enabled: !!address,
    staleTime: DAY,
    gcTime: DAY * 7,
    queryFn: async (): Promise<string | null> => {
      const claimed = await queryClient.fetchQuery({
        queryKey: CLAIMED_KEY,
        staleTime: CLAIMED_STALE_MS,
        queryFn: () => fetchClaimedMap(),
      })
      const fullName = claimed.get(address!.toLowerCase())
      if (fullName) return fullName
      try {
        return (await ensClient.getEnsName({ address: address! })) ?? null
      } catch {
        // The public mainnet RPC sometimes rate-limits; returning null lets
        // callers fall back to a truncated address instead of spinning.
        return null
      }
    },
  })
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
  })
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
    queryKey: ['ens-avatar', name],
    enabled: !!name,
    staleTime: DAY,
    gcTime: DAY * 7,
    queryFn: async (): Promise<string | null> => {
      try {
        return (await ensClient.getEnsAvatar({ name: normalize(name!) })) ?? null
      } catch {
        return null
      }
    },
  })
}

async function fetchClaimedMap(): Promise<Map<string, string>> {
  const identities = await fetchAllSubnameIdentities()
  const map = new Map<string, string>()
  for (const i of identities) {
    map.set(i.address.toLowerCase(), i.fullName)
  }
  return map
}
