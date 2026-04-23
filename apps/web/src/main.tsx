import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'

import { getRouter } from './router'
import { getContext } from './integrations/tanstack-query/root-provider'
import { wagmiConfig } from './lib/wagmi'
import './styles.css'

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

createRoot(rootEl).render(
  <StrictMode>
    {PRIVY_APP_ID ? (
      // Provider order per Privy docs:
      // PrivyProvider > QueryClientProvider > WagmiProvider
      // https://docs.privy.io/guide/react/wallets/usage/wagmi
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          // Array order drives modal order — web2 methods first, wallet last,
          // so new users see the friendly path before the crypto path. Each
          // method must also be enabled in the Privy dashboard.
          loginMethods: ['email', 'google', 'apple', 'twitter', 'wallet'],
          embeddedWallets: {
            ethereum: { createOnLogin: 'off' },
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={wagmiConfig}>
            <RouterProvider router={router} />
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    ) : (
      <MissingAppId />
    )}
  </StrictMode>,
)

function MissingAppId() {
  return (
    <main style={{ maxWidth: 560, margin: '6rem auto', padding: '0 1.5rem', fontFamily: 'system-ui' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.6, marginBottom: 16 }}>
        Config required
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
        Privy App ID is not set
      </h1>
      <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
        Create an app at{' '}
        <a href="https://dashboard.privy.io" target="_blank" rel="noreferrer">
          dashboard.privy.io
        </a>
        , then add the App ID to <code>apps/web/.env.local</code>:
      </p>
      <pre style={{ padding: 16, background: 'rgba(128,128,128,0.12)', fontSize: 12, borderRadius: 4 }}>
        VITE_PRIVY_APP_ID=your-app-id-here
      </pre>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 16 }}>Then restart the dev server.</p>
    </main>
  )
}
