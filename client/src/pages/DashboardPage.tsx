import { useAuth } from '../auth/AuthContext'

// Placeholder home page. It exists so we can prove that the protected route and
// logout work. Later it becomes the auction list.
export default function DashboardPage() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-emerald-400">Live Auction</h1>
        <div className="flex items-center gap-4">
          {/* ProtectedRoute guarantees `user` exists here, but TypeScript can't
              know that across components, so we use ?. instead of a non-null assertion (!). */}
          <span className="text-slate-300">{user?.name}</span>
          <button
            onClick={() => void logout()}
            className="rounded-md border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
          >
            Log out
          </button>
		  {/* void logout() marks the promise as intentionally not awaited. It keeps lint rules about floating promises quiet, and it's fine here because logout can't meaningfully fail in the UI. */}
        </div>
      </header>
    </div>
  )
}