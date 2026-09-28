import { Router } from 'express'
import { z } from 'zod'
import { Auction } from '../models/Auction'
import { Bid } from '../models/Bid'
import { requireAuth } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { endExpiredAuctions, placeBid } from '../services/bidding'
import { broadcast } from '../lib/realtime'

export const auctionsRouter = Router()

const MAX_CENTS = 100_000_000 // 1,000,000.00, far inside the safe integer range

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  startingPriceCents: z.number().int().min(1).max(MAX_CENTS),
  durationMinutes: z.number().int().min(1).max(7 * 24 * 60),
})

const bidSchema = z.object({
  amountCents: z.number().int().min(1).max(MAX_CENTS),
})

// A malformed id would make Mongoose throw a CastError (a 500). Checking the
// shape first turns it into a clean 404.
const objectId = z.string().regex(/^[a-f\d]{24}$/i)
function parseId(raw: string | string[] | undefined): string {
  const result = objectId.safeParse(raw)
  if (!result.success) throw new HttpError(404, 'Auction not found')
  return result.data
}

// A populated ref is an object with a name. An unpopulated one is only an id.
// `any` because Mongoose's populated types are awkward; this helper is the only place.
function refToDto(ref: any): { id: string; name: string | null } | null {
  if (!ref) return null
  if (typeof ref === 'object' && 'name' in ref) return { id: String(ref._id), name: ref.name }
  return { id: String(ref), name: null }
}

// The shape the client sees. Built by hand so internal fields (__v) never leak.
function auctionToDto(a: any) {
  const ended = a.status === 'ended' || a.endsAt <= new Date()
  return {
    id: String(a._id),
    title: a.title,
    description: a.description,
    seller: refToDto(a.seller),
    startingPriceCents: a.startingPriceCents,
    currentBidCents: a.currentBidCents,
    bidCount: a.bidCount,
    endsAt: a.endsAt.toISOString(),
    status: ended ? 'ended' : 'live',
    winner: ended ? refToDto(a.highestBidder) : null,
    leader: !ended ? refToDto(a.highestBidder) : null,
  }
}

// One serializer for bids, used by the detail route, the bid route, AND the
// broadcast, so the client only ever has to understand one bid shape.
function bidToDto(b: any) {
  return {
    id: String(b._id),
    bidder: refToDto(b.bidder),
    amountCents: b.amountCents,
    createdAt: b.createdAt.toISOString(),
  }
}

auctionsRouter.get('/', async (_req, res) => {
  await endExpiredAuctions()
  const auctions = await Auction.find()
    .sort({ status: -1, endsAt: 1 }) // 'live' sorts after 'ended' alphabetically, so -1 puts live first
    .limit(50)
    .populate('seller', 'name')
  res.json({ auctions: auctions.map(auctionToDto), serverTime: new Date().toISOString() })
})

auctionsRouter.post('/', requireAuth, async (req, res) => {
  const input = createSchema.parse(req.body)

  const auction = await Auction.create({
    title: input.title,
    description: input.description,
    seller: req.userId,
    startingPriceCents: input.startingPriceCents,
    currentBidCents: input.startingPriceCents,
    endsAt: new Date(Date.now() + input.durationMinutes * 60_000),
  })

  res.status(201).json({ auction: auctionToDto(auction), serverTime: new Date().toISOString() })
})

auctionsRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  await endExpiredAuctions()

  const auction = await Auction.findById(id).populate('seller', 'name').populate('highestBidder', 'name')
  if (!auction) throw new HttpError(404, 'Auction not found')

  const bids = await Bid.find({ auction: id }).sort({ createdAt: -1 }).limit(20).populate('bidder', 'name')

  res.json({
    auction: auctionToDto(auction),
    bids: bids.map(bidToDto),
    serverTime: new Date().toISOString(),
  })
})

auctionsRouter.post('/:id/bids', requireAuth, async (req, res) => {
  const id = parseId(req.params.id)
  const { amountCents } = bidSchema.parse(req.body)

  const result = await placeBid({ auctionId: id, userId: req.userId as string, amountCents })

  if (!result.ok) {
    switch (result.reason) {
      case 'not_found':
        throw new HttpError(404, 'Auction not found')
      case 'own_auction':
        throw new HttpError(403, 'You cannot bid on your own auction')
      case 'ended':
        throw new HttpError(409, 'This auction has ended')
      case 'too_low':
        throw new HttpError(409, `Bid too low. Minimum is ${result.minimumCents} cents`)
    }
  }

  // Reload both documents WITH names populated, because the client displays
  // "who is winning". The bid is already safely saved at this point, so a
  // failure below would only affect the broadcast, and not the bid itself.
  const [fresh, bid] = await Promise.all([
    Auction.findById(id).populate('seller', 'name').populate('highestBidder', 'name'),
    Bid.findById(result.bidId).populate('bidder', 'name'),
  ])
  if (!fresh || !bid) throw new HttpError(500, 'Bid saved but could not be loaded')

  const payload = {
    auction: auctionToDto(fresh),
    bid: bidToDto(bid),
    serverTime: new Date().toISOString(),
  }

  // Tell everyone watching this auction (including the bidder's other tabs)...
  broadcast(id, 'bid:new', payload)
  // ...and answer the bidder directly, so their own screen updates even if
  // their socket happens to be disconnected right now.
  res.status(201).json(payload)
})