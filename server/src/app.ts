import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'
import { env } from './config/env'
import { authRouter } from './routes/auth'
import { errorHandler } from './middleware/errorHandler'

// The app is built and exported here, but it is NOT started here. Starting
// (connecting to the database and listening on a port) happens in index.ts.
// The split matters for two reasons:
//  1. Tests can import `app` and send fake requests to it, with no real
//     server, no port conflicts, and no database connection required.
//  2. Socket.IO needs to attach to a raw HTTP server (created in index.ts), which
//     wraps this app. If app.listen() were called in here, we couldn't do that.
export const app = express()

// Render (and most hosts) put a proxy in front of the app and terminate HTTPS
// there, so Express sees plain HTTP. Without this line Express would think
// the connection is insecure, and refuse to send `secure` cookies. The 1 means
// "trust exactly one proxy hop", which is safer than `true` (trust any).
// It also makes req.ip correct behind the proxy, which rate limiting will need.
app.set('trust proxy', 1)

// Sets a bundle of protective HTTP headers (no MIME sniffing, no clickjacking
// framing, and so on) for one line of code.
app.use(helmet())

// CORS: which websites may call this API from a browser.
//  origin: one exact origin, never '*'. A wildcard is not allowed together
//          with credentials, and it would let any site use a logged-in user's cookie.
//  credentials: true is required for the browser to accept and send cookies
//          on cross-origin requests. Without it login silently fails.
app.use(cors({ origin: env.CLIENT_URL, credentials: true }))

// Parses JSON request bodies into req.body. Express's built-in parser is
// enough, so the old `body-parser` package isn't needed.
app.use(express.json())

// Parses the Cookie header into req.cookies. requireAuth depends on it.
app.use(cookieParser())

// Health check, useful for uptime pings that keep a free Render service awake,
// and for checking that the database connection is alive.
app.get('/api/health', (_req, res) => {
  // readyState 1 means "connected".
  res.json({ ok: true, db: mongoose.connection.readyState === 1 })
})

// Mounted under /api/auth, so the route '/register' becomes POST /api/auth/register.
// The /api prefix also matches the Vite dev proxy configured earlier.
app.use('/api/auth', authRouter)

// The error handler MUST come last. Express calls it only for errors raised by
// middleware and routes registered above it.
app.use(errorHandler)