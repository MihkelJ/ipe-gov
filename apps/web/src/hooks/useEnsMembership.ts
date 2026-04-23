import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { sepolia } from 'viem/chains'

const REQUIRED_SUFFIX = '.ipecity.eth'

export function useEnsMembership(address: Address | undefined) {
  const sepoliaClient = usePublicClient({ chainId: sepolia.id })

  return useQuery({
    queryKey: ['ens-membership', address],
    enabled: Boolean(address && sepoliaClient),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!address || !sepoliaClient) return { name: null, isMember: false }
      const name = await sepoliaClient.getEnsName({ address })
      return {
        name,
        isMember: typeof name === 'string' && name.endsWith(REQUIRED_SUFFIX),
      }
    },
  })
}

export const IPECITY_SUFFIX = REQUIRED_SUFFIX
