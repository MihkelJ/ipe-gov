import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'

import { getRouter } from './router'
import { getContext } from './integrations/tanstack-query/root-provider'
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

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
