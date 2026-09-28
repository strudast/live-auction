import axios, { isAxiosError } from 'axios'

// One shared axios instance, so every request gets the same settings and we
// never repeat them. The alternative (calling axios.get(...) or fetch(...)
// everywhere) means repeating the base URL and credentials option in every call.
export const api = axios.create({
  // In development this stays '/api', a relative URL. The Vite proxy we
  // configured forwards it to localhost:4000, so the browser only ever talks to
  // one origin and we avoid CORS problems locally.
  // In production we may set VITE_API_URL at build time, for example
  // 'https://my-api.onrender.com/api'. Vite only exposes env vars prefixed VITE_.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',

  // Without this, the browser refuses to send or store cookies on requests.
  // Our JWT lives in an httpOnly cookie, so this line is what makes login work.
  withCredentials: true,
})

// Shape of the error body our server sends (see errorHandler.ts on the server).
interface ApiErrorBody {
  error?: string
  details?: { path: string; message: string }[]
}

// Turns any thrown value into a message that is safe to show to a user.
// The type is `unknown` on purpose: anything can be thrown in JavaScript, and
// `unknown` forces us to check what we have before using it, unlike `any`.
export function getErrorMessage(err: unknown): string {
  if (isAxiosError<ApiErrorBody>(err)) {
    // No response at all means the network failed or the server is down/asleep.
    // On Render's free tier a sleeping server can take up to a minute to wake up.
    if (!err.response) {
      return 'Cannot reach the server. It may be waking up, so try again in a moment.'
    }

    const body = err.response.data

    // Validation errors from zod: show every problem, not only the first one.
    if (body?.details?.length) {
      return body.details.map((d) => `${d.path}: ${d.message}`).join('. ')
    }

    if (body?.error) return body.error
  }

  return 'Something went wrong. Please try again.'
}