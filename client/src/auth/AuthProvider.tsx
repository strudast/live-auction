import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthContext } from './AuthContext'
import type { AuthContextValue } from './AuthContext'
import { fetchMe, loginRequest, logoutRequest, registerRequest } from '../api/auth'

// The cache key for "the current user". Defined once so no place mistypes it.
const ME_KEY = ['me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // The current user is server state: it lives on the server and we hold a copy.
  // TanStack Query is built for that, and gives us caching and loading state
  // for free. The alternative, useEffect + useState, means writing loading flags,
  // cleanup, and race-condition handling by hand.
  const meQuery = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    // The default is 3 retries with backoff. That would make a slow or failing
    // server feel even slower on first load, so we fail fast and show the login page.
    retry: false,
    // Treat the answer as fresh for 5 minutes so we don't refetch on every
    // window focus or component mount.
    staleTime: 5 * 60 * 1000,
  })

  // Login, register, and logout are plain async functions rather than
  // useMutation. The forms track their own "submitting" and "error" state, so
  // useMutation would add a layer that we never read from.
  // The key move in each function is writing the user straight into the query
  // cache with setQueryData. Everything reading ['me'] updates instantly, with
  // no extra network request.
  const value: AuthContextValue = {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,

    login: async (input) => {
      const user = await loginRequest(input)
      queryClient.setQueryData(ME_KEY, user)
    },

    register: async (input) => {
      const user = await registerRequest(input)
      queryClient.setQueryData(ME_KEY, user)
    },

    logout: async () => {
      await logoutRequest()
      // Set the user to null first, so the route guard redirects right away.
      queryClient.setQueryData(ME_KEY, null)
      // Then drop every other cached query (auctions, bids, ...). Otherwise the
      // next person to log in on the same browser could briefly see the
      // previous user's data. We keep ['me'] itself because the app is
      // actively reading it.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    },
  }

  // A fresh `value` object on every render re-renders consumers each time, but
  // this provider only re-renders when the user changes. useMemo would be a
  // premature optimization here.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}