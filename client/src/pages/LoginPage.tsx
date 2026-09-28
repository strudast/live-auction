import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getErrorMessage } from '../api/client'
import { TextField } from '../components/TextField'

export default function LoginPage() {
  const { login } = useAuth()

  // Plain useState for two fields. A form library (react-hook-form, Formik)
  // pays off with many fields or complex validation, but for two inputs it would
  // be more code and more concepts than it saves.
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // Stop the browser from doing a full page reload, which is the default form behaviour.
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login({ email, password })
      // Nothing to do on success: GuestRoute notices the user and redirects.
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      // `finally` runs on both paths, so the button never stays stuck on "Signing in…".
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white">Log in</h1>

        {/* role="alert" makes screen readers announce the error when it appears. */}
        {error && (
          <p role="alert" className="rounded-md bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {/* autoComplete values let password managers fill these in correctly. */}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Disabled while submitting so a double click can't send two requests. */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Log in'}
        </button>

        <p className="text-sm text-slate-400">
          No account?{' '}
                  {/* Lets a reviewer try the app in one click. The password is public on
            purpose (see the seed script). This calls the state setters directly,
            so the form works normally after it fills the fields. */}
        <button
          type="button"
          onClick={() => {
            setEmail('demo@example.com')
            setPassword('demo1234')
          }}
          className="text-sm text-slate-400 underline hover:text-slate-200"
        >
          Fill in demo account
        </button>
         </p>
          <Link to="/register" className="text-emerald-400 hover:underline">
            Register
          </Link>
       
      </form>
    </div>
  )
}