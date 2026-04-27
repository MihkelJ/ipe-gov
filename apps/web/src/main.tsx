import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { base, mainnet, sepolia } from 'viem/chains'
import { getRouter } from './router'
import { getContext } from './integrations/tanstack-query/root-provider'
import { wagmiConfig } from './lib/wagmi'
import './styles.css'

// JSON.stringify can't serialize BigInt — react-query / router devtools and
// any incidental console.log of wagmi args (proposal IDs, block numbers,
// vote handles) would throw `TypeError: Do not know how to serialize a
// BigInt` and crash the render. Coerce to a decimal string so anything that
// passes through JSON sees a serializable value.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(BigInt.prototype as any).toJSON = function () {
  return this.toString()
}

// Inline theme init: run before React mounts to avoid a flash of the wrong theme.
try {
  const stored = localStorage.getItem('theme')
  const mode =
    stored === 'light' || stored === 'dark'
      ? stored
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.classList.add(mode)
  document.documentElement.style.colorScheme = mode
} catch {}

const { queryClient } = getContext()
const router = getRouter(queryClient)

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
if (!PRIVY_APP_ID) throw new Error('VITE_PRIVY_APP_ID is not set')

createRoot(rootEl).render(
  <StrictMode>
    {/*
      Provider order per Privy docs:
      PrivyProvider > QueryClientProvider > WagmiProvider
      https://docs.privy.io/guide/react/wallets/usage/wagmi
    */}
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Array order drives modal order — web2 methods first, wallet last,
        // so new users see the friendly path before the crypto path. Each
        // method must also be enabled in the Privy dashboard.
        loginMethods: ['email', 'google', 'wallet'],
        // Pin external wallets to Sepolia on connect; governance contracts
        // live there. Base is allowed for the read-only IPE balance; mainnet
        // is allowed so members can edit their ENS profile records on the
        // wrapped subname directly via PublicResolver.
        defaultChain: sepolia,
        supportedChains: [sepolia, base, mainnet],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <RouterProvider router={router} />
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </StrictMode>,
)
