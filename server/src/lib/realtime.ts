import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import { env } from '../config/env'

// A module-level singleton, so any route can call broadcast() without `io`
// being threaded through every function. The trade-off is hidden global
// state. It's acceptable because there is exactly one server per process,
// and the null check makes broadcast() a harmless no-op in tests, where no
// socket server exists.
let io: Server | null = null

// Same shape check as the REST routes. Never join a room named by raw user input.
const OBJECT_ID = /^[a-f\d]{24}$/i
const room = (auctionId: string) => `auction:${auctionId}`

export function initRealtime(httpServer: HttpServer): void {
  io = new Server(httpServer, {
    // Socket.IO does its own CORS handling, separate from Express's.
    cors: { origin: env.CLIENT_URL, credentials: true },
  })

  io.on('connection', (socket) => {
    // The only message clients may send: "put me in this auction's room".
    // Data arriving from a socket is untyped, so we validate it like any request body.
    socket.on('auction:join', (auctionId: unknown) => {
      if (typeof auctionId === 'string' && OBJECT_ID.test(auctionId)) {
        void socket.join(room(auctionId))
      }
    })
    // No 'leave' handler needed: when a socket disconnects, Socket.IO removes it from all rooms.
  })
}

// Sends an event to everyone currently watching one auction.
export function broadcast(auctionId: string, event: string, payload: unknown): void {
  io?.to(room(auctionId)).emit(event, payload)
}