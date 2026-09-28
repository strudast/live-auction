import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { clockOffset, getAuction, placeBidRequest } from '../api/auctions'
import type { AuctionDetail, BidEventPayload, BidResult } from '../api/auctions'
import { getErrorMessage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { formatDuration, useCountdown } from '../hooks/useCountdown'
import { formatCents, parseMoneyToCents } from '../lib/money'
import { socket } from '../lib/socket'

// Merges a new bid into the cached auction page. It is called from TWO places
// (the POST response and the socket event), so it has to be safe to call twice
// with the same bid, and safe when events arrive out of order.
function applyBid(queryClient: QueryClient, auctionId: string, incoming: BidResult) {
  queryClient.setQueryData<AuctionDetail>(['auction', auctionId], (old) => {
    if (!old) return old // page not loaded yet: the initial fetch will contain this bid

    // Every accepted bid increments bidCount, so a higher-or-equal count means
    // "newer state". Ignoring older snapshots stops a late event from moving
    // the price backwards.
    const isNewer = incoming.auction.bidCount >= old.auction.bidCount
    const alreadyListed = old.bids.some((b) => b.id === incoming.bid.id)

    // ISO timestamps sort correctly as plain strings, so localeCompare is enough.
    const bids = alreadyListed
      ? old.bids
      : [incoming.bid, ...old.bids].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)

    return {
      auction: isNewer ? incoming.auction : old.auction,
      bids,
      clockOffsetMs: isNewer ? incoming.clockOffsetMs : old.clockOffsetMs,
    }
  })
}

// Keeps the page in sync while it's open: connect, join the room, listen for bids.
function useLiveAuction(auctionId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!auctionId) return

    // Runs on the first connection AND after every automatic reconnect. Rooms
    // are forgotten when a connection drops, so we must join again each time.
    const onConnect = () => socket.emit('auction:join', auctionId)

    const onBid = (payload: BidEventPayload) => {
      applyBid(queryClient, auctionId, {
        auction: payload.auction,
        bid: payload.bid,
        clockOffsetMs: clockOffset(payload.serverTime),
      })
    }

    // After a drop (or a sleeping free-tier server waking up) we may have missed
    // bids, and nothing replays them. Refetching once is the simple, reliable fix.
    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: ['auction', auctionId] })
    }

    socket.on('connect', onConnect)
    socket.on('bid:new', onBid)
    socket.io.on('reconnect', onReconnect)
    socket.connect()
    if (socket.connected) onConnect() // already connected: 'connect' won't fire again

    // Cleanup runs on unmount, and on auction change. It also runs between the
    // two passes of React StrictMode in development, which is why setup
    // and cleanup must be exact opposites.
    return () => {
      socket.off('connect', onConnect)
      socket.off('bid:new', onBid)
      socket.io.off('reconnect', onReconnect)
      socket.disconnect() // leaving all rooms as a side effect
    }
  }, [auctionId, queryClient])
}

export default function AuctionPage() {
  const { id = '' } = useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ['auction', id],
    queryFn: () => getAuction(id),
    enabled: id !== '',
    retry: false, // a 404 won't fix itself, so don't make the user wait through retries
  })

  useLiveAuction(id)

  if (isLoading) return <p className="text-slate-400">Loading auction…</p>
  if (error || !data) {
    return (
      <div>
        <p role="alert" className="text-red-400">{error ? getErrorMessage(error) : 'Auction not found'}</p>
        <Link to="/" className="text-emerald-400 hover:underline">Back to auctions</Link>
      </div>
    )
  }

  // The content lives in a child component because it uses hooks that need
  // `data` to exist. Hooks can't be called after an early return like the ones above.
  return <AuctionView data={data} />
}

function AuctionView({ data }: { data: AuctionDetail }) {
  const { auction, bids, clockOffsetMs } = data
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const msLeft = useCountdown(auction.endsAt, clockOffsetMs)
  // The server says 'ended' once someone reads after expiry, but the client
  // should stop accepting bids the moment its own countdown hits zero.
  const ended = auction.status === 'ended' || msLeft === 0

  // When the countdown reaches zero locally, fetch once to learn the winner.
  useEffect(() => {
    if (msLeft === 0 && auction.status === 'live') {
      void queryClient.invalidateQueries({ queryKey: ['auction', auction.id] })
    }
  }, [msLeft, auction.status, auction.id, queryClient])

  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSeller = user?.id === auction.seller?.id
  const isLeading = !ended && auction.leader?.id === user?.id
  // Mirrors the server's rule: the first bid may equal the starting price,
  // later bids must beat the current price by at least one cent.
  const minCents = auction.bidCount === 0 ? auction.currentBidCents : auction.currentBidCents + 1

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const cents = parseMoneyToCents(amount)
    if (cents === null || cents < 1) {
      setError('Enter a valid amount, like 12.50')
      return
    }
    // Client-side check is for instant feedback only. The server enforces the
    // real rule atomically, and can still reject a bid that was valid a moment ago.
    if (cents < minCents) {
      setError(`Minimum bid is ${formatCents(minCents)}`)
      return
    }

    setSubmitting(true)
    try {
      const result = await placeBidRequest(auction.id, cents)
      applyBid(queryClient, auction.id, result)
      setAmount('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-slate-400 hover:text-white">
        ← All auctions
      </Link>

      <div>
        <h1 className="text-3xl font-bold">{auction.title}</h1>
        <p className="text-sm text-slate-400">Sold by {auction.seller?.name ?? 'unknown'}</p>
        {auction.description && <p className="mt-3 text-slate-300">{auction.description}</p>}
      </div>

      <div className="grid gap-4 rounded-lg border border-slate-700 bg-slate-800 p-4 sm:grid-cols-2">
        <div>
          <p className="text-sm text-slate-400">{ended ? 'Final price' : 'Current bid'}</p>
          <p className="text-4xl font-bold text-emerald-400">{formatCents(auction.currentBidCents)}</p>
          <p className="mt-1 text-sm text-slate-400">
            {ended
              ? auction.winner
                ? `Won by ${auction.winner.name}`
                : 'No bids, not sold'
              : auction.leader
                ? isLeading
                  ? "You're winning"
                  : `Leading: ${auction.leader.name}`
                : 'No bids yet'}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-slate-400">Time left</p>
          <p className={`text-4xl font-bold tabular-nums ${!ended && msLeft < 30_000 ? 'text-red-400' : ''}`}>
            {ended ? 'Ended' : formatDuration(msLeft)}
          </p>
          <p className="mt-1 text-sm text-slate-500">A bid in the last 30s extends the clock</p>
        </div>
      </div>

      {!ended && (
        <form onSubmit={handleSubmit} className="space-y-2">
          {isSeller ? (
            <p className="text-slate-400">You can't bid on your own auction.</p>
          ) : (
            <>
              {error && (
                <p role="alert" className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  aria-label="Bid amount in euros"
                  inputMode="decimal"
                  placeholder={`${(minCents / 100).toFixed(2)} or more`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {submitting ? 'Bidding…' : 'Place bid'}
                </button>
              </div>
              <p className="text-sm text-slate-500">Minimum: {formatCents(minCents)}</p>
            </>
          )}
        </form>
      )}

      <div>
        <h2 className="mb-2 font-semibold">Bid history</h2>
        {bids.length === 0 ? (
          <p className="text-slate-500">No bids yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-lg border border-slate-700">
            {bids.map((b) => (
              <li key={b.id} className="flex justify-between px-4 py-2">
                <span>{b.bidder?.name ?? 'unknown'}</span>
                <span className="tabular-nums">
                  {formatCents(b.amountCents)}{' '}
                  <span className="text-xs text-slate-500">{new Date(b.createdAt).toLocaleTimeString()}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}