import { Auction } from '../models/Auction'
import { Bid } from '../models/Bid'

// After any accepted bid, at least this much time remains ("soft close").
export const SNIPE_WINDOW_MS = 30_000

// A discriminated union: the caller checks `ok` first, and TypeScript then
// knows which other fields exist. This beats throwing for expected outcomes
// like "bid too low", which are normal results, not exceptions.
export type BidOutcome =
   | { ok: true; auction: NonNullable<Awaited<ReturnType<typeof Auction.findOneAndUpdate>>>; bidId: string }
  | { ok: false; reason: 'not_found' | 'own_auction' | 'ended' }
  | { ok: false; reason: 'too_low'; minimumCents: number }

interface PlaceBidInput {
  auctionId: string
  userId: string
  amountCents: number
  now?: Date // injectable so tests don't depend on the real clock
}

export async function placeBid({
  auctionId,
  userId,
  amountCents,
  now = new Date(),
}: PlaceBidInput): Promise<BidOutcome> {
  // THE important part. Everything that decides whether a bid is valid is in
  // the FILTER, and the change is applied in the same operation. MongoDB
  // guarantees a single-document update is atomic, so when 50 bids arrive at
  // once they are applied one at a time, each seeing the result of the previous.
  //
  // The tempting alternative is: read the auction, compare in JavaScript, then
  // write. Two requests can both read price 100, both decide 120 and 130 are
  // valid, and the later write silently overwrites the higher bid. Read-then-write
  // is exactly the bug this design avoids.
  const updated = await Auction.findOneAndUpdate(
    {
      _id: auctionId,
      status: 'live',
      endsAt: { $gt: now }, // server clock only, never trust the client's time
      seller: { $ne: userId }, // sellers can't bid on their own items
      // First bid may equal the starting price (<=). Later bids must beat the
      // current price strictly (<). bidCount tells the two cases apart.
      $or: [
        { bidCount: 0, currentBidCents: { $lte: amountCents } },
        { bidCount: { $gt: 0 }, currentBidCents: { $lt: amountCents } },
      ],
    },
    {
      $set: { currentBidCents: amountCents, highestBidder: userId },
      $inc: { bidCount: 1 },
      // $max keeps the LARGER of the current endsAt and now+30s. Far from the
      // end, endsAt is bigger and nothing changes. Inside the last 30 seconds,
      // now+30s is bigger and the auction is extended. One atomic operation.
      $max: { endsAt: new Date(now.getTime() + SNIPE_WINDOW_MS) },
    },
    { new: true }, // return the document AFTER the update
  )

  if (updated) {
    // A separate write after the atomic one. If the process crashed between
    // the two, the auction would have a winning bid missing from history. That
    // is a known limitation (MongoDB transactions could close it). It is
    // acceptable here and belongs in the README.
 const bid = await Bid.create({ auction: auctionId, bidder: userId, amountCents })
    return { ok: true, auction: updated, bidId: bid.id }
  }

  // The bid was rejected. Look at the auction again ONLY to explain why. This
  // read can be slightly stale under heavy load, but it affects only the error
  // message, never whether a bid was accepted.
  const auction = await Auction.findById(auctionId)
  if (!auction) return { ok: false, reason: 'not_found' }
  if (auction.status !== 'live' || auction.endsAt <= now) return { ok: false, reason: 'ended' }
  if (auction.seller.equals(userId)) return { ok: false, reason: 'own_auction' }

  const minimumCents = auction.bidCount === 0 ? auction.currentBidCents : auction.currentBidCents + 1
  return { ok: false, reason: 'too_low', minimumCents }
}

// Marks expired auctions as ended. Called before reads instead of a timer. A
// setTimeout per auction would be lost on every restart and every free-tier
// sleep, but this needs no memory and can't miss one.
export async function endExpiredAuctions(now = new Date()): Promise<void> {
  await Auction.updateMany({ status: 'live', endsAt: { $lte: now } }, { $set: { status: 'ended' } })
}