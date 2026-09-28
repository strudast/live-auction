import { rateLimit } from 'express-rate-limit'
import type { Request } from 'express'
import { env } from '../config/env'

// A JSON body in the same shape as every other error we send ({ error: "..." }),
// so the client's getErrorMessage() shows it with no special handling.
const message = { error: 'Too many requests. Please slow down and try again shortly.' }

// Options shared by every limiter below.
const common = {
  // Sends the standard RateLimit-* headers so well-behaved clients can see their
  // remaining budget. The old X-RateLimit-* headers are switched off.
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  message,
  // Tests fire many requests in a few seconds and shouldn't hit the limits.
  skip: () => env.NODE_ENV === 'test',
}

// Login: brute-force protection.
// skipSuccessfulRequests: only failed attempts (status >= 400) use up the
// budget, so a real user who logs in fine never gets locked out by their own logins.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
})

// Registration: every attempt counts, since the abuse here is creating accounts,
// which succeeds. 5 per hour per IP is plenty for real people.
export const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 5,
})

// Bids: keyed by USER, not IP. This limiter must run AFTER requireAuth, so req.userId exists.
// 30 per minute is far above what a human bids, and low enough to stop a script from
// flooding the database. Because the key is never an IP address, there is
// nothing to normalize for IPv6.
export const bidLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req: Request) => req.userId ?? 'anonymous',
})

// A generous backstop for the whole API, per IP. It's not meant to catch
// normal use, just a client stuck in a request loop. The health endpoint is
// skipped so an uptime monitor pinging it can never be blocked.
export const apiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 100,
  skip: (req: Request) => env.NODE_ENV === 'test' || req.originalUrl.startsWith('/api/health'),
})