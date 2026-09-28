import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { User } from '../models/User'
import { Auction } from '../models/Auction'
import { Bid } from '../models/Bid'
import { SNIPE_WINDOW_MS, placeBid } from './bidding'

// Real MongoDB behaviour is the thing under test (atomic updates), so we use a
// real in-memory MongoDB instead of mocking mongoose. A mock would just confirm
// our assumptions about atomicity instead of testing them.
let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  // Make sure the unique/compound indexes exist before the first test runs.
  await Promise.all([User.init(), Auction.init(), Bid.init()])
}, 180_000) // generous: the first run downloads a MongoDB binary

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Auction.deleteMany({}), Bid.deleteMany({})])
})

async function makeUsers(count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      User.create({ name: `user${i}`, email: `user${i}@test.com`, passwordHash: 'x' }),
    ),
  )
}

async function makeAuction(sellerId: string, overrides: Record<string, unknown> = {}) {
  return Auction.create({
    title: 'Test item',
    seller: sellerId,
    startingPriceCents: 100,
    currentBidCents: 100,
    endsAt: new Date(Date.now() + 60 * 60 * 1000), // one hour from now
    ...overrides,
  })
}

describe('placeBid', () => {
  it('keeps the highest bid when 50 different bids arrive at once', async () => {
    const [seller, ...bidders] = await makeUsers(51)
    const auction = await makeAuction(seller!.id)

    // Bidder i bids 101 + i cents, so the highest is 150 (bidder 49).
    const results = await Promise.all(
      bidders.map((b, i) => placeBid({ auctionId: auction.id, userId: b.id, amountCents: 101 + i })),
    )

    const accepted = results.filter((r) => r.ok).length
    const final = await Auction.findById(auction.id)

    // The highest bid can never lose, whatever order they arrive in.
    expect(final!.currentBidCents).toBe(150)
    expect(String(final!.highestBidder)).toBe(bidders[49]!.id)
    // Bookkeeping must agree: counter, history, and accepted responses.
    expect(final!.bidCount).toBe(accepted)
    expect(await Bid.countDocuments({ auction: auction.id })).toBe(accepted)
    expect(accepted).toBeGreaterThanOrEqual(1)
  })

  it('accepts exactly one of 20 identical simultaneous bids', async () => {
    const [seller, ...bidders] = await makeUsers(21)
    const auction = await makeAuction(seller!.id)

    const results = await Promise.all(
      bidders.map((b) => placeBid({ auctionId: auction.id, userId: b.id, amountCents: 500 })),
    )

    // A tie must have one winner. Two "successful" equal bids would mean the
    // check and the write were not atomic.
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const final = await Auction.findById(auction.id)
    expect(final!.bidCount).toBe(1)
  })

  it('lets the first bid equal the starting price, then requires strictly higher', async () => {
    const [seller, a, b] = await makeUsers(3)
    const auction = await makeAuction(seller!.id)

    expect((await placeBid({ auctionId: auction.id, userId: a!.id, amountCents: 100 })).ok).toBe(true)

    const tie = await placeBid({ auctionId: auction.id, userId: b!.id, amountCents: 100 })
    expect(tie).toEqual({ ok: false, reason: 'too_low', minimumCents: 101 })

    expect((await placeBid({ auctionId: auction.id, userId: b!.id, amountCents: 101 })).ok).toBe(true)
  })

  it('rejects bids from the seller', async () => {
    const [seller] = await makeUsers(1)
    const auction = await makeAuction(seller!.id)

    const result = await placeBid({ auctionId: auction.id, userId: seller!.id, amountCents: 500 })
    expect(result).toEqual({ ok: false, reason: 'own_auction' })
  })

  it('rejects bids after the auction has ended', async () => {
    const [seller, bidder] = await makeUsers(2)
    const auction = await makeAuction(seller!.id, { endsAt: new Date(Date.now() - 1000) })

    const result = await placeBid({ auctionId: auction.id, userId: bidder!.id, amountCents: 500 })
    expect(result).toEqual({ ok: false, reason: 'ended' })
  })

  it('extends the end time when a bid lands inside the last 30 seconds', async () => {
    const [seller, bidder] = await makeUsers(2)
    const auction = await makeAuction(seller!.id, { endsAt: new Date(Date.now() + 5000) })

    const now = new Date()
    const result = await placeBid({ auctionId: auction.id, userId: bidder!.id, amountCents: 500, now })

    expect(result.ok).toBe(true)
    const final = await Auction.findById(auction.id)
    expect(final!.endsAt.getTime()).toBe(now.getTime() + SNIPE_WINDOW_MS)
  })

  it('does not change the end time for an early bid', async () => {
    const [seller, bidder] = await makeUsers(2)
    const endsAt = new Date(Date.now() + 60 * 60 * 1000)
    const auction = await makeAuction(seller!.id, { endsAt })

    await placeBid({ auctionId: auction.id, userId: bidder!.id, amountCents: 500 })

    const final = await Auction.findById(auction.id)
    expect(final!.endsAt.getTime()).toBe(endsAt.getTime())
  })
})