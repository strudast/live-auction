import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { createAuctionRequest } from '../api/auctions'
import { getErrorMessage } from '../api/client'
import { parseMoneyToCents } from '../lib/money'
import { TextField } from '../components/TextField'

// Short durations exist on purpose, so you (and a reviewer) can create an
// auction and watch it end, and try the anti-sniping extension, in a couple of minutes.
const DURATIONS = [
  { minutes: 2, label: '2 minutes (demo)' },
  { minutes: 10, label: '10 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '1 day' },
]

export default function CreateAuctionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState(String(DURATIONS[0]!.minutes))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    // Convert the text to cents here, before sending, so the server never sees "12.5".
    const startingPriceCents = parseMoneyToCents(price)
    if (startingPriceCents === null || startingPriceCents < 1) {
      setError('Enter a valid starting price, like 12.50')
      return
    }

    setSubmitting(true)
    try {
      const auction = await createAuctionRequest({
        title,
        description,
        startingPriceCents,
        durationMinutes: Number(duration),
      })
      // The list is now out of date. Marking it stale makes it refetch next time it's shown.
      await queryClient.invalidateQueries({ queryKey: ['auctions'] })
      navigate(`/auctions/${auction.id}`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">New auction</h1>

      {error && (
        <p role="alert" className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <TextField label="Title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-300">
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <TextField
        label="Starting price (€)"
        inputMode="decimal"
        placeholder="10.00"
        required
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <div>
        <label htmlFor="duration" className="mb-1 block text-sm font-medium text-slate-300">
          Duration
        </label>
        <select
          id="duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {DURATIONS.map((d) => (
            <option key={d.minutes} value={d.minutes}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create auction'}
      </button>
    </form>
  )
}