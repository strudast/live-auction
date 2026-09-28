import { Schema, model } from 'mongoose'

// Bid history. The Auction document holds only the current winning state.
// Keeping every bid in its own collection (instead of an array inside the
// auction) means the auction document doesn't grow without limit, and history
// can be paginated.
const bidSchema = new Schema(
  {
    auction: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
    bidder: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountCents: { type: Number, required: true, min: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }, // bids are never edited
)

// "Latest bids for this auction" is the only query we run on this collection.
bidSchema.index({ auction: 1, createdAt: -1 })

export const Bid = model('Bid', bidSchema)