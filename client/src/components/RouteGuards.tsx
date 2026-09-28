import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Shown while we don't yet know if the visitor is logged in. Without it, a
// logged-in user refreshing the page would see a flash of the login screen
// (user is still null) before being sent back. On Render's free tier the
// first request can take a long time, so the message is worth being honest about.
function FullPageMessage({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-300">
      {text}
    </div>
  )
}

// Wraps pages that need a logged-in user.
// It renders <Outlet />, the place where the matched child route appears, so
// we can guard many routes at once by nesting them in App.tsx instead of
// adding a check to every page.
export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageMessage text="Connecting to server…" />

  if (!user) {
    // `replace` swaps the history entry, so the Back button doesn't bounce the user
    // back onto a page that immediately redirects them again.
    // `state.from` remembers where they were going so we can return them after login.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

// The opposite guard: keeps logged-in users off /login and /register.
// It also handles the redirect that follows a successful login. When login()
// writes the user into the cache, this component re-renders and sends the
// visitor onward. That means the login page doesn't need to call navigate()
// itself, and there's no race between two competing redirects.
export function GuestRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageMessage text="Connecting to server…" />

  if (user) {
    // router state is untyped, so we narrow it by hand. If it isn't what we expect, go home.
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    return <Navigate to={from ?? '/'} replace />
  }

  return <Outlet />
}