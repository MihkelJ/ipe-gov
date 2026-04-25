import { useQuery } from '@tanstack/react-query'
import { mainnet } from 'viem/chains'
import { usePublicClient } from 'wagmi'

const MIN = 1000 * 60

/** Fetch a fixed set of ENSIP-18 text records for a name from mainnet,
 *  multicalled into one RPC. Returns a `key -> value` map; missing keys
 *  resolve to `''` so the editor binds cleanly. */
export function useEnsTextRecords(name: string | null | undefined, keys: readonly string[]) {
  const client = usePublicClient({ chainId: mainnet.id })
  return useQuery({
    queryKey: ['ens-text', name, keys],
    enabled: Boolean(name && client),
    staleTime: 5 * MIN,
    gcTime: 30 * MIN,
    queryFn: async (): Promise<Record<string, string>> => {
      if (!name || !client) return {}
      const results = await Promise.all(
        keys.map(async (key) => {
          try {
            const value = await client.getEnsText({ name, key })
            return [key, value ?? ''] as const
          } catch {
            return [key, ''] as const
          }
        }),
      )
      return Object.fromEntries(results)
    },
  })
}
