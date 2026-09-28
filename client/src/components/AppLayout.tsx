import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// The shared frame (header + content area) for every logged-in page. It's a
// layout route: pages render into <Outlet />, so the header exists once
// and is never copied into each page.
export function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between p-4">
          <Link to="/" className="text-xl font-bold text-emerald-400">
            Live Auction
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/auctions/new" className="text-slate-300 hover:text-white">
              New auction
            </Link>
            <span className="text-slate-500">{user?.name}</span>
            <button
              onClick={() => void logout()}
              className="rounded-md border border-slate-600 px-3 py-1 hover:bg-slate-800"
            >
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">
        <Outlet />
      </main>
    </div>
  )
}