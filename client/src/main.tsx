import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import './index.css'

// Created once at module level, outside any component. If it were created
// inside a component, every re-render would build a new client and throw away the cache.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Order matters. AuthProvider uses react-query, so it must sit inside
        QueryClientProvider. The router sits outside the app so the route guards
        can use router hooks. */}
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)