import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { mainnet } from 'viem/chains'
import { namehash, normalize } from 'viem/ens'
import { useReadContract } from 'wagmi'

// ENS NameWrapper on Ethereum mainnet. ipecity.eth is wrapped here, so
// subnames minted through the standard flow are ERC-1155 tokens on this
// contract. `ownerOf(id)` returns the current holder of a specific wrapped
// name (id = namehash of the full name as a uint256), or the zero address
// if the name isn't wrapped or has expired.
const NAME_WRAPPER_ADDRESS =
  '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401' as const

const NAME_WRAPPER_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
] as const

export const IPECITY_PARENT = 'ipecity.eth'
const STORAGE_PREFIX = 'ipecity:subname:'

function toFullName(input: string): string {
  const cleaned = input.trim().toLowerCase().replace(/\.ipecity\.eth$/, '')
  return `${cleaned}.${IPECITY_PARENT}`
}

function cacheKey(address: Address): string {
  return `${STORAGE_PREFIX}${address.toLowerCase()}`
}

export function useIpecityEns(address: Address | undefined) {
  const [candidate, setCandidate] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setCandidate(null)
      setLocalError(null)
      return
    }
    setCandidate(localStorage.getItem(cacheKey(address)))
  }, [address])

  let tokenId: bigint | undefined
  if (candidate) {
    try {
      tokenId = BigInt(namehash(normalize(toFullName(candidate))))
    } catch {
      tokenId = undefined
    }
  }

  const query = useReadContract({
    abi: NAME_WRAPPER_ABI,
    address: NAME_WRAPPER_ADDRESS,
    chainId: mainnet.id,
    functionName: 'ownerOf',
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      enabled: Boolean(address && tokenId !== undefined),
      staleTime: 60_000,
    },
  })

  const ownerMatches =
    Boolean(address) &&
    typeof query.data === 'string' &&
    query.data.toLowerCase() === address!.toLowerCase()

  useEffect(() => {
    if (ownerMatches && candidate && address) {
      localStorage.setItem(cacheKey(address), candidate)
    }
  }, [ownerMatches, candidate, address])

  const verify = useCallback((input: string) => {
    setLocalError(null)
    try {
      normalize(toFullName(input))
      setCandidate(input.trim())
    } catch {
      setLocalError('Invalid ENS name.')
    }
  }, [])

  const clear = useCallback(() => {
    if (address) localStorage.removeItem(cacheKey(address))
    setCandidate(null)
    setLocalError(null)
  }, [address])

  const fullName = candidate ? toFullName(candidate) : null
  const hasResult = query.data !== undefined && !query.isFetching

  return {
    verifiedName: ownerMatches ? fullName : null,
    isChecking: Boolean(candidate) && query.isFetching,
    rejected: Boolean(candidate) && hasResult && !ownerMatches,
    error:
      localError ??
      (query.error ? 'Lookup failed — try again in a moment.' : null),
    verify,
    clear,
  }
}
