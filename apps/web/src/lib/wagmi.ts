import { createConfig } from '@privy-io/wagmi'
import { base, sepolia } from 'viem/chains'
import { http } from 'wagmi'

// Privy owns wallet connection; wagmi provides the chain/transport layer
// that existing hooks (useAccount, useReadContract, useSponsoredWrite) read
// from. Sepolia is the governance chain. The paymaster-proxy worker routes
// by method — non-bundler traffic falls through to a regular Sepolia node,
// so it's safe to use as the single transport for both reads and UserOps.
// Base is added read-only so we can pull IPE governance-token balances via
// multicall; no writes go through this transport.
export const wagmiConfig = createConfig({
  chains: [sepolia, base],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_PAYMASTER_PROXY_URL),
    [base.id]: http(import.meta.env.VITE_BASE_RPC_URL, {
      batch: true,
    }),
  },
})
