import { Router } from 'express'
import { z } from 'zod'
import { Auction } from '../models/Auction'
import { Bid } from '../models/Bid'
import { requireAuth } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { endExpiredAuctions, placeBid } from '../services/bidding'

export const auctionsRouter = Router()

const MAX_CENTS = 100_000_000 // 1,000,000.00. A sane ceiling that stays far inside safe integer range.

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  startingPriceCents: z.number().int().min(1).max(MAX_CENTS),
  // Minimum 1 minute, so a demo auction can be created and watched end quickly.
  durationMinutes: z.number().int().min(1).max(7 * 24 * 60),
})

const bidSchema = z.object({
  // .int() rejects 10.5. Fractions of a cent must never reach the database.
  amountCents: z.number().int().min(1).max(MAX_CENTS),
})

// Malformed ids would make Mongoose throw a CastError (a 500). Checking the
// shape first turns them into a clean 404.
const objectId = z.string().regex(/^[a-f\d]{24}$/i)
function parseId(raw: string | string[] | undefined): string {
  const result = objectId.safeParse(raw)
  if (!result.success) throw new HttpError(404, 'Auction not found')
  return result.data
}

// A populated ref is an object with a name. An unpopulated one is just an id.
// Handling both lets one serializer serve every route. `any` is used because
// Mongoose's populated types are awkward, and this small helper is the only place.
function refToDto(ref: any): { id: string; name: string | null } | null {
  if (!ref) return null
  if (typeof ref === 'object' && 'name' in ref) return { id: String(ref._id), name: ref.name }
  return { id: String(ref), name: null }
}

// The shape the client sees. Building it by hand (rather than sending the raw
// document) keeps internal fields such as __v out of the API.
function auctionToDto(a: any) {
  const now = new Date()
  // Live-but-expired counts as ended even if the cleanup hasn't run yet.
  const ended = a.status === 'ended' || a.endsAt <= now
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

// The client should compute its countdown from the SERVER's clock. Sending
// serverTime lets it measure the offset from the user's own clock once.
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
    bids: bids.map((b: any) => ({
      id: String(b._id),
      bidder: refToDto(b.bidder),
      amountCents: b.amountCents,
      createdAt: b.createdAt.toISOString(),
    })),
    serverTime: new Date().toISOString(),
  })
})

auctionsRouter.post('/:id/bids', requireAuth, async (req, res) => {
  const id = parseId(req.params.id)
  const { amountCents } = bidSchema.parse(req.body)

  const result = await placeBid({ auctionId: id, userId: req.userId as string, amountCents })

  if (!result.ok) {
    // Each expected failure gets a fitting status code. 409 Conflict means
    // "valid request, but it conflicts with the current state".
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

  res.status(201).json({ auction: auctionToDto(result.auction), serverTime: new Date().toISOString() })
})