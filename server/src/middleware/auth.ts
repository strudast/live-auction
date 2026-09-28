import type { NextFunction, Request, Response } from 'express'
import { COOKIE_NAME, verifyToken } from '../lib/token'
import { HttpError } from './errorHandler'

// Extends Express's Request type so `req.userId` is known to TypeScript.
// This is declaration merging: we add one optional field to the existing
// interface instead of casting `(req as any).userId` in every route.
// (A lint rule against `namespace` may complain. It is the standard way to
// augment Express's types, so an ignore comment is fine if it does.)
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// Put this in front of any route that needs a logged-in user:
//   router.get('/me', requireAuth, handler)
// It reads the cookie, checks the token, and attaches the user id to the request.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  // cookie-parser (registered in app.ts) is what fills req.cookies.
  // The `?.` is defensive in case it isn't registered.
  const token = req.cookies?.[COOKIE_NAME]
  const userId = token ? verifyToken(token) : null

  // Throwing is enough: Express 5 routes it to errorHandler, giving a 401.
  if (!userId) throw new HttpError(401, 'Not authenticated')

  req.userId = userId
  next()
}