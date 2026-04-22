import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import Footer from '../components/Footer'
import Header from '../components/Header'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import { wagmiConfig } from '../lib/wagmi'
import appCss from '../styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

// Inline script runs before React hydration to avoid a flash of the wrong theme.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme');var m=(s==='light'||s==='dark')?s:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.add(m);document.documentElement.style.colorScheme=m;}catch(e){}})();`

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'ipe-gov — Confidential DAO governance' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  // Wallet + FHE state is client-only; render the whole app on the client and
  // serve just the HTML shell from the server.
  ssr: false,
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: ({ error }) => <ErrorPage message={error.message} />,
  notFoundComponent: NotFoundPage,
})

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider>
        <Header />
        <Outlet />
        <Footer />
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
            TanStackQueryDevtools,
          ]}
        />
      </RainbowKitProvider>
    </WagmiProvider>
  )
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
    </main>
  )
}
