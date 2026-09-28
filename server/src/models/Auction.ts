import { Schema, model } from 'mongoose'

const auctionSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },

    // Refs store the user's ObjectId. populate() can swap it for the user's name when we need it.
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Whole numbers of cents. Floats can't represent 0.10 exactly, so sums and
    // comparisons drift. Integers are exact, and the UI formats them as money.
    startingPriceCents: { type: Number, required: true, min: 1 },

    // Starts equal to startingPriceCents. The bidding service treats "no bids
    // yet" specially, so the first bid may equal the starting price.
    currentBidCents: { type: Number, required: true, min: 1 },

    highestBidder: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    // Stored as a real Date, not a duration. Only the server's clock decides when it ends.
    endsAt: { type: Date, required: true },

    // Only 'live' and 'ended'. It is a denormalized convenience. The truth is
    // endsAt, and the service also treats live-but-expired as ended.
    status: { type: String, enum: ['live', 'ended'], default: 'live' },

    // Doubles as "have there been any bids". Incremented atomically with each accepted bid.
    bidCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

// The list page and expiry cleanup filter on status and endsAt.
auctionSchema.index({ status: 1, endsAt: 1 })

export const Auction = model('Auction', auctionSchema)