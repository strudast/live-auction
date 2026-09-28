import jwt from 'jsonwebtoken'
import { env } from '../config/env'

// Name of the cookie that holds the login token. A constant, so the routes,
// middleware, and (later) the Socket.IO handshake can never disagree on it.
export const COOKIE_NAME = 'token'

// 7 days in milliseconds (cookie lifetimes use ms). This matches the token's
// own '7d' expiry below. If they differed, you could hold a valid cookie
// with a dead token, or the reverse.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const isProd = env.NODE_ENV === 'production'

// Why an httpOnly cookie rather than a token in localStorage?
//  - httpOnly means JavaScript on the page cannot read it, so an XSS bug
//    can't simply copy the token and use it elsewhere. localStorage tokens
//    can be stolen that way.
//  - Note the limit: an XSS attacker can still make requests as the user
//    from inside their browser. httpOnly reduces the damage, and doesn't
//    prevent XSS itself.
//  - The cost is that cookies are sent automatically, which is what makes
//    CSRF a concern (see the caveat about production in the notes).
//
// secure: only sent over HTTPS. Off in development because localhost is
//   plain HTTP, so a secure cookie would never be stored.
// sameSite: controls when the browser attaches the cookie to cross-site requests.
//   'lax'  = development, where the client and API share the "localhost" site.
//   'none' = production with the client and API on different domains. Browsers
//            only accept 'none' together with secure: true, which is why
//            isProd drives both.
export const clearCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
}

// `as const` keeps 'none' and 'lax' as literal types. Without it TypeScript
// widens them to `string`, and Express's cookie options only accept the literals.

// clearCookie needs the same flags as the original cookie, or the browser
// treats it as a different cookie and won't delete it. It must not include
// maxAge, so login options are the clear options plus maxAge.
export const cookieOptions = { ...clearCookieOptions, maxAge: MAX_AGE_MS }

export function signToken(userId: string): string {
  // The payload holds only the user id, in the standard `sub` (subject) claim.
  // A JWT payload is encoded, not encrypted: anyone holding the token can read
  // it. So we never put sensitive data in it. We also don't put the
  // name or email there, so it can't go stale when a profile changes. We look
  // the user up in the database when we need the details.
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: '7d' })
}

// Returns the user id, or null for any invalid token (expired, tampered, wrong
// secret, malformed). Returning null instead of throwing gives callers one
// simple path: "no valid user". The Socket.IO handshake will use this too.
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    // verify() can return either a string or an object depending on how the
    // token was signed, so we check the shape before trusting it.
    if (typeof payload === 'object' && typeof payload.sub === 'string') return payload.sub
    return null
  } catch {
    return null
  }
}