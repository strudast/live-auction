import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
// Importing env loads .env AND validates it, exactly like the server does.
import { env } from '../config/env'
import { User } from '../models/User'
import { Auction } from '../models/Auction'
import { Bid } from '../models/Bid'

// Public on purpose: it is printed in the README and shown on the login page.
// Never reuse a real password for anything in this project.
const DEMO_PASSWORD = 'demo1234'

// example.com is a domain reserved for documentation, so these addresses can never
// belong to a real person, and it's easy to recognise seeded accounts by it.
// The order matters: auction specs below refer to people by index.
const PEOPLE = [
  { name: 'Demo User', email: 'demo@example.com' }, // 0
  { name: 'Alice', email: 'alice@example.com' }, // 1
  { name: 'Bob', email: 'bob@example.com' }, // 2
  { name: 'Carol', email: 'carol@example.com' }, // 3
]

interface AuctionSpec {
  title: string
  description: string
  seller: number // index into PEOPLE
  startCents: number
  endsInMinutes: number // negative = already ended
  bidders: number[] // who bid, in order; the LAST one is the leader / winner
}

const SPECS: AuctionSpec[] = [
  {
    title: 'Vintage film camera',
    description: 'Fully working 35mm camera with leather case. Light meter needs a new battery.',
    seller: 1,
    startCents: 8000,
    endsInMinutes: 3 * 24 * 60,
    bidders: [2, 3, 2, 3],
  },
  {
    title: 'Mechanical keyboard, hot-swap',
    description: 'Tenkeyless, lubed switches, extra keycap set included.',
    seller: 2,
    startCents: 4500,
    endsInMinutes: 26 * 60,
    bidders: [1, 3, 1],
  },
  {
    title: 'Signed first-edition paperback',
    description: 'Good condition, small crease on the back cover. No bids yet, so be the first.',
    seller: 3,
    startCents: 2000,
    endsInMinutes: 5 * 24 * 60,
    bidders: [],
  },
  {
    title: "Demo User's desk lamp",
    description: 'You are the seller here, so the bid form is replaced by a notice.',
    seller: 0,
    startCents: 1500,
    endsInMinutes: 2 * 24 * 60,
    bidders: [1, 2, 3],
  },
  {
    title: 'Retro game console (ENDED)',
    description: 'Ended auction where the demo user won.',
    seller: 1,
    startCents: 6000,
    endsInMinutes: -24 * 60,
    bidders: [2, 3, 2, 0],
  },
  {
    title: 'Ceramic vase (ENDED)',
    description: 'Ended auction that received no bids.',
    seller: 2,
    startCents: 3000,
    endsInMinutes: -3 * 24 * 60,
    bidders: [],
  },
]

async function main() {
  await mongoose.connect(env.MONGODB_URI)
  // Show WHERE we are about to write, so a wrong .env is obvious before any damage.
  console.log(`Seeding database "${mongoose.connection.name}" on ${mongoose.connection.host}`)

  // 1. Create or update the demo users. Upserting means running the script twice
  //    never fails on the unique email index, and it re-sets the password,
  //    so the documented password always works.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const users = []
  for (const person of PEOPLE) {
    const user = await User.findOneAndUpdate(
      { email: person.email },
      { $set: { name: person.name, passwordHash } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    if (!user) throw new Error(`Could not upsert ${person.email}`)
    users.push(user)
  }

  // 2. Delete ONLY previously seeded data: auctions sold by demo users, plus the bids on them.
  //    Bids are matched through the auction, not through the bidder. A demo
  //    user's bid on a REAL user's auction must survive, or that auction's
  //    price and history would no longer agree.
  const oldAuctions = await Auction.find({ seller: { $in: users.map((u) => u._id) } }).select('_id')
  const oldIds = oldAuctions.map((a) => a._id)
  await Bid.deleteMany({ auction: { $in: oldIds } })
  await Auction.deleteMany({ _id: { $in: oldIds } })

  // 3. Create the auctions, then their bid history.
  const now = Date.now()
  for (const spec of SPECS) {
    if (spec.bidders.includes(spec.seller)) {
      throw new Error(`Bad spec "${spec.title}": the seller cannot bid on their own auction`)
    }

    const seller = users[spec.seller]!
    const endsAt = new Date(now + spec.endsInMinutes * 60_000)
    const ended = spec.endsInMinutes < 0
    const count = spec.bidders.length

    // Every bid must beat the previous one, so amounts step up by about 8% of the
    // start price, rounded to whole euros (and at least 1 euro).
    const increment = Math.max(100, Math.round((spec.startCents * 0.08) / 100) * 100)
    const amounts = spec.bidders.map((_, i) => spec.startCents + i * increment)

    const leader = count > 0 ? users[spec.bidders[count - 1]!]! : null

    // The auction document must agree with its bids: current price, bid count and
    // leader. The real bidding service maintains this invariant, and since we
    // insert directly, we have to maintain it ourselves.
    const auction = await Auction.create({
      title: spec.title,
      description: spec.description,
      seller: seller._id,
      startingPriceCents: spec.startCents,
      currentBidCents: count > 0 ? amounts[count - 1]! : spec.startCents,
      highestBidder: leader ? leader._id : null,
      bidCount: count,
      endsAt,
      status: ended ? 'ended' : 'live',
    })

    // Space the bids 90 minutes apart, with the last one shortly before the end (ended
    // auctions) or shortly before now (live ones), so history timestamps look real
    // and are all in the past.
    const lastBidAt = ended ? endsAt.getTime() - 5 * 60_000 : now - 10 * 60_000
    const bids = spec.bidders.map((who, i) => ({
      auction: auction._id,
      bidder: users[who]!._id,
      amountCents: amounts[i]!,
      createdAt: new Date(lastBidAt - (count - 1 - i) * 90 * 60_000),
    }))
    if (bids.length > 0) await Bid.insertMany(bids)
  }

  console.log(`Done: ${users.length} users, ${SPECS.length} auctions.`)
  console.log(`Demo login: demo@example.com / ${DEMO_PASSWORD}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1 // report failure to the shell without cutting off pending cleanup
  })
  .finally(() => mongoose.disconnect())