import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getErrorMessage } from '../api/client'
import { TextField } from '../components/TextField'

export default function RegisterPage() {
  const { register } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await register({ name, email, password })
    } catch (err) {
      // A duplicate email arrives as a 409 with "Email already registered".
      // getErrorMessage already turns that into readable text.
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-white">Create account</h1>

        {error && (
          <p role="alert" className="rounded-md bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <TextField
          label="Name"
          autoComplete="name"
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {/* minLength / maxLength here only give instant feedback. The server's
            zod schema is the real authority, because anyone can bypass browser
            checks. We mirror its limits (8 to 72) so users rarely hit them. */}
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? 'Creating account…' : 'Register'}
        </button>

        <p className="text-sm text-slate-400">
          Already registered?{' '}
          <Link to="/login" className="text-emerald-400 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  )
}