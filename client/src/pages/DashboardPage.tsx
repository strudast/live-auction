import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listAuctions } from '../api/auctions'
import { getErrorMessage } from '../api/client'
import { formatCents } from '../lib/money'
import { Countdown } from '../components/Countdown'

// The auction list. It is not live over sockets. It just refetches every 15
// seconds, which is enough for a browse page. Sockets are reserved for the
// page where a second of delay actually matters.
export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['auctions'],
    queryFn: listAuctions,
    refetchInterval: 15_000,
  })

  if (isLoading) return <p className="text-slate-400">Loading auctions…</p>
  if (error) return <p role="alert" className="text-red-400">{getErrorMessage(error)}</p>
  if (!data || data.auctions.length === 0) {
    return (
      <p className="text-slate-400">
        No auctions yet.{' '}
        <Link to="/auctions/new" className="text-emerald-400 hover:underline">
          Create the first one
        </Link>
      </p>
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {data.auctions.map((a) => (
        <li key={a.id}>
          <Link
            to={`/auctions/${a.id}`}
            className="block rounded-lg border border-slate-700 bg-slate-800 p-4 hover:border-emerald-500"
          >
            <h2 className="font-semibold">{a.title}</h2>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{formatCents(a.currentBidCents)}</p>
            <p className="mt-2 flex justify-between text-sm text-slate-400">
              <span>{a.bidCount} {a.bidCount === 1 ? 'bid' : 'bids'}</span>
              {a.status === 'ended' ? (
                <span>Ended</span>
              ) : (
                <Countdown endsAt={a.endsAt} clockOffsetMs={data.clockOffsetMs} />
              )}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}