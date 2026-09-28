import { formatDuration, useCountdown } from '../hooks/useCountdown'

// A small self-contained countdown, used on the list cards. Each card gets its
// own timer, which is fine for 50 cards. The auction page uses the hook
// directly because it needs the raw number for its own logic.
export function Countdown({ endsAt, clockOffsetMs }: { endsAt: string; clockOffsetMs: number }) {
  const msLeft = useCountdown(endsAt, clockOffsetMs)
  return <span>{msLeft === 0 ? 'Ended' : formatDuration(msLeft)}</span>
}