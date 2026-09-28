import { useEffect, useState } from 'react'

// Milliseconds left until `endsAt`, updating four times a second, never below 0.
// `clockOffsetMs` corrects for the browser clock being wrong. The countdown is
// only cosmetic: the server decides when bidding actually closes.
export function useCountdown(endsAt: string, clockOffsetMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // 250ms (not 1000) so the display never lags a visible second behind
    // after an anti-sniping extension changes endsAt.
    const timer = setInterval(() => setNow(Date.now()), 250)
    // Cleanup stops the timer when the component unmounts. Without it, every
    // visit to the page would leave one more interval running.
    return () => clearInterval(timer)
  }, [])

  return Math.max(0, Date.parse(endsAt) - (now + clockOffsetMs))
}

export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}