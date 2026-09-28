import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

// A custom error carrying an HTTP status code. Any route can write
// `throw new HttpError(404, 'Auction not found')` and the handler below turns
// it into the right response. The alternative is calling res.status(404).json(...)
// inside every route, which repeats the response shape everywhere and
// makes it easy to be inconsistent.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Express recognises an error handler by its FOUR parameters. We must declare
// all four even though `_next` is unused, or Express treats it as a normal
// middleware and never calls it for errors. The underscores tell the linter
// that the unused parameters are intentional.
//
// Routes never need try/catch: Express 5 catches errors thrown in async
// handlers (or rejected promises) and passes them here automatically.
// Express 4 did not do this, and unhandled rejections just hung the request.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Zod throws this when req.body fails validation. It is the client's mistake,
  // so 400, and we return which fields failed so the UI can show it.
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  // Errors we threw on purpose, with a message safe to show the client.
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }

  // Anything else is a bug or an infrastructure failure. We log the real error
  // for ourselves but send a generic message. Sending err.message would
  // leak internals (database details, file paths) to whoever triggered it.
  console.error(err)
  return res.status(500).json({ error: 'Internal server error' })
}