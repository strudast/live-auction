import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { User } from '../models/User'
import { requireAuth } from '../middleware/auth'
import { HttpError } from '../middleware/errorHandler'
import { COOKIE_NAME, clearCookieOptions, cookieOptions, signToken } from '../lib/token'

// Validation schemas. We never trust req.body: anyone can send anything to this
// endpoint with curl, so the browser's form checks don't count as security.
// Parsing also strips fields we didn't ask for, which stops a client from
// sneaking extra fields (like a role) into a database write.
const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email(),
  // Max 72: bcrypt only uses the first 72 bytes, so a longer password would
  // silently have its tail ignored. Rejecting it is more honest than accepting it.
  password: z.string().min(8).max(72),
})

const loginSchema = z.object({
  email: z.email(),
  // Login only checks that a password was sent. Enforcing length rules here would
  // be pointless, and it would lock out anyone whose old password predates a rule change.
  password: z.string().min(1),
})

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body)

  // The 12 is bcrypt's cost factor: each +1 doubles the hashing time. Slowness is
  // the point, because it makes stolen hashes expensive to crack. 12 takes
  // roughly a quarter of a second on typical hardware. bcryptjs (pure JS) is
  // slower than native bcrypt but installs without a compiler on Windows,
  // which is a good trade for this project.
  const passwordHash = await bcrypt.hash(password, 12)

  let user
  try {
    user = await User.create({ name, email, passwordHash })
  } catch (err: any) {
    // Duplicate key error from the unique index on email. Mongo reports it with
    // code 11000. `any` is used because caught errors are untyped, and this
    // is the one place we need to read `.code`.
    if (err?.code === 11000) throw new HttpError(409, 'Email already registered')
    throw err
  }

  // Sign the user in immediately. Forcing a separate login right after
  // registering is bad UX and gains nothing.
  res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions)

  // We build the response by hand and never send the whole `user` document.
  // Sending only chosen fields is safer than removing sensitive ones, because
  // a field added to the model later stays private by default.
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } })
})

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body)

  // passwordHash is select:false in the model, so we ask for it explicitly.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash')

  // If the user doesn't exist we skip bcrypt.compare and answer at once, which
  // leaks a timing difference: a fast "no" means "no such email". At this scale
  // it's an acceptable trade-off, and I'd mention it in the README as a
  // known limitation. Closing it fully means comparing against a dummy hash.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false

  // The SAME message for "no such email" and "wrong password". Different
  // messages would let an attacker discover which emails have accounts.
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password')

  res.cookie(COOKIE_NAME, signToken(user.id), cookieOptions)
  res.json({ user: { id: user.id, name: user.name, email: user.email } })
})

authRouter.post('/logout', (_req, res) => {
  // The token lives in an httpOnly cookie that JavaScript can't remove, so the
  // server has to send the instruction to delete it. Logging out is also a
  // POST rather than a GET: a GET can be triggered by anything, like an <img>
  // tag on another site, and that would log people out.
  // Limitation: the JWT itself stays technically valid until it expires,
  // because the server keeps no session list. Fixing that needs a token
  // denylist, which is more machinery than this project needs.
  res.clearCookie(COOKIE_NAME, clearCookieOptions)
  res.status(204).end() // 204 = success with no body
})

authRouter.get('/me', requireAuth, async (req, res) => {
  // requireAuth proves the token is valid, but the user may have been deleted
  // since it was issued. So we still check the database, and treat a missing
  // user like a bad token.
  const user = await User.findById(req.userId)
  if (!user) throw new HttpError(401, 'Not authenticated')
  res.json({ user: { id: user.id, name: user.name, email: user.email } })
})