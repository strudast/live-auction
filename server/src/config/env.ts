// Loads the variables from .env into process.env. Importing 'dotenv/config'
// runs it as a side effect. It has to happen before we read process.env below.
import 'dotenv/config'
import { z } from 'zod'

// Describe what a valid environment looks like, then check it once at startup.
// Why validate instead of using process.env.X directly everywhere?
//  - A missing variable stops the server immediately with a clear message,
//    instead of causing a confusing crash minutes later (for example jwt.sign
//    failing on the first login).
//  - Everything is typed. process.env values are all `string | undefined`,
//    and after parsing, env.PORT is a real number.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // process.env values are always strings. `coerce` converts "4000" to 4000.
  PORT: z.coerce.number().default(4000),

  MONGODB_URI: z.string().min(1),

  // Minimum 32 characters, so a lazy secret like "secret" is rejected.
  // Short secrets can be brute-forced offline from a stolen token.
  JWT_SECRET: z.string().min(32),

  // Must be a valid URL. It is used for CORS, which compares origins as exact
  // strings, so a trailing slash in this value would silently break CORS.
  CLIENT_URL: z.url(),
})

// parse() throws if anything is wrong. We deliberately don't catch it: a server
// with a bad config should not start.
export const env = schema.parse(process.env)