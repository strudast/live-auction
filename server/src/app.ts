import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'
import { env } from './config/env'
import { authRouter } from './routes/auth'
import { errorHandler } from './middleware/errorHandler'
import { auctionsRouter } from './routes/auctions'
import { apiLimiter, loginLimiter, registerLimiter } from './middleware/rateLimit'
import path from 'path'

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

// Rate limiting runs before body parsing, so rejected requests cost almost
// nothing. It runs after CORS so that browsers can still read the 429 response.
app.use('/api', apiLimiter)
app.use('/api/auth/login', loginLimiter)
app.use('/api/auth/register', registerLimiter)

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
app.use('/api/auctions', auctionsRouter)

// In production this server also serves the built React app, so the whole project
// is one origin. In development Vite serves the client, so none of this runs.
if (env.NODE_ENV === 'production') {
  // __dirname is server/dist once compiled, so ../../client/dist is the Vite output.
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist')

  // Serves the JS/CSS bundles and other static files.
  app.use(express.static(clientDist))

  // React Router handles URLs like /auctions/123 in the browser, so a refresh
  // on such a URL must still return index.html. We limit this to GET requests and
  // skip /api, so a mistyped API URL gets an error and not an HTML page.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next()
    }
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// The error handler MUST come last. Express calls it only for errors raised by
// middleware and routes registered above it.
app.use(errorHandler)