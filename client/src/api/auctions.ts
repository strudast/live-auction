import { api } from './client'

export interface PersonRef {
  id: string
  name: string | null
}

export interface Auction {
  id: string
  title: string
  description: string
  seller: PersonRef | null
  startingPriceCents: number
  currentBidCents: number
  bidCount: number
  endsAt: string // ISO timestamp
  status: 'live' | 'ended'
  winner: PersonRef | null // only set once ended
  leader: PersonRef | null // only set while live
}

export interface Bid {
  id: string
  bidder: PersonRef | null
  amountCents: number
  createdAt: string
}

// Difference between the server's clock and this browser's clock. Add it to
// Date.now() to get "server now". It ignores network latency, so it is off
// by a few hundred milliseconds at worst, which is fine for a countdown.
export function clockOffset(serverTime: string): number {
  return Date.parse(serverTime) - Date.now()
}

export async function listAuctions() {
  const { data } = await api.get<{ auctions: Auction[]; serverTime: string }>('/auctions')
  return { auctions: data.auctions, clockOffsetMs: clockOffset(data.serverTime) }
}

export interface AuctionDetail {
  auction: Auction
  bids: Bid[]
  clockOffsetMs: number
}

export async function getAuction(id: string): Promise<AuctionDetail> {
  const { data } = await api.get<{ auction: Auction; bids: Bid[]; serverTime: string }>(`/auctions/${id}`)
  return { auction: data.auction, bids: data.bids, clockOffsetMs: clockOffset(data.serverTime) }
}

export interface CreateAuctionInput {
  title: string
  description: string
  startingPriceCents: number
  durationMinutes: number
}

export async function createAuctionRequest(input: CreateAuctionInput): Promise<Auction> {
  const { data } = await api.post<{ auction: Auction }>('/auctions', input)
  return data.auction
}

// What the socket event carries (raw, as sent by the server).
export interface BidEventPayload {
  auction: Auction
  bid: Bid
  serverTime: string
}

// The same thing after conversion, which is also what the bid POST returns.
export interface BidResult {
  auction: Auction
  bid: Bid
  clockOffsetMs: number
}

export async function placeBidRequest(auctionId: string, amountCents: number): Promise<BidResult> {
  const { data } = await api.post<BidEventPayload>(`/auctions/${auctionId}/bids`, { amountCents })
  return { auction: data.auction, bid: data.bid, clockOffsetMs: clockOffset(data.serverTime) }
}