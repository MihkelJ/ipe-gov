import { createConfig } from '@privy-io/wagmi'
import { sepolia } from 'viem/chains'
import { http } from 'wagmi'

// Privy owns wallet connection; wagmi provides the chain/transport layer
// that existing hooks (useAccount, useReadContract, useSponsoredWrite) read
// from. Sepolia is the only chain — governance writes and ENS lookups both
// resolve against it.
export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(
      import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined,
    ),
  },
})
