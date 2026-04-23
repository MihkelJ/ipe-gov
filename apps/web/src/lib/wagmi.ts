import { createConfig } from '@privy-io/wagmi'
import { mainnet, sepolia } from 'viem/chains'
import { http } from 'wagmi'

// Privy owns wallet connection; wagmi provides the chain/transport layer
// that existing hooks (useAccount, useReadContract, useSponsoredWrite) read
// from. Sepolia is the app's primary chain; mainnet is added read-only so
// the onboarding gate can resolve ipecity.eth subname ownership against the
// ENS NameWrapper. The paymaster-proxy worker routes by method — non-bundler
// traffic falls through to a regular Sepolia node, so it's safe to use as
// the single transport for both reads and UserOps.
export const wagmiConfig = createConfig({
  chains: [sepolia, mainnet],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_PAYMASTER_PROXY_URL),
    [mainnet.id]: http(),
  },
})
