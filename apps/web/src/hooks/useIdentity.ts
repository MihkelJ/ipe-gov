import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createPublicClient, http, namehash, type Address } from 'viem'
import { mainnet } from 'viem/chains'

const DAY = 1000 * 60 * 60 * 24
const IPECITY_PARENT = 'ipecity.eth'
// ENS legacy hosted subgraph — deprecated June 2024 but ENS's deployment is
// still indexing mainnet blocks and serves queries without an API key.
const ENS_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'
const SUBNAMES_KEY = ['ipecity-subnames'] as const

// Standalone mainnet client: wagmi is Sepolia-only, ENS lives on L1.
const ensClient = createPublicClient({ chain: mainnet, transport: http() })

/** Resolve display name for an address. Precedence:
 *  1. Wrapped `*.ipecity.eth` subname (from ENS subgraph)
 *  2. ENS primary name (reverse resolution on mainnet)
 *  3. `null` — caller falls back to truncated address. */
export function useIdentity(address: Address | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['identity', address?.toLowerCase()],
    enabled: !!address,
    staleTime: DAY,
    gcTime: DAY * 7,
    queryFn: async (): Promise<string | null> => {
      const subnames = await queryClient.fetchQuery({
        queryKey: SUBNAMES_KEY,
        staleTime: 1000 * 60 * 10,
        queryFn: fetchIpecitySubnames,
      })
      const ipe = subnames.get(address!.toLowerCase())
      if (ipe) return ipe
      return (await ensClient.getEnsName({ address: address! })) ?? null
    },
  })
}

/** Map of wrapped-subname owners for `ipecity.eth`. Shared with `useIdentity`
 *  via the `ipecity-subnames` query key, so there's only ever one fetch. */
export function useIpecitySubnames() {
  return useQuery({
    queryKey: SUBNAMES_KEY,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    queryFn: fetchIpecitySubnames,
  })
}

type DomainRow = { name: string | null; wrappedOwner: { id: string } | null }

async function fetchIpecitySubnames(): Promise<Map<string, string>> {
  const query = /* GraphQL */ `
    query Subnames($parent: String!) {
      domains(first: 1000, where: { parent: $parent, wrappedOwner_not: null }) {
        name
        wrappedOwner { id }
      }
    }
  `
  const res = await fetch(ENS_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { parent: namehash(IPECITY_PARENT) } }),
  })
  if (!res.ok) throw new Error(`ens subgraph ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as {
    data?: { domains: DomainRow[] }
    errors?: { message: string }[]
  }
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  const map = new Map<string, string>()
  for (const d of json.data?.domains ?? []) {
    const owner = d.wrappedOwner?.id?.toLowerCase()
    if (owner && d.name) map.set(owner, d.name)
  }
  return map
}
