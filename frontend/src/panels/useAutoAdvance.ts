import { useEffect, useRef } from 'react'

export const PLAY_INTERVAL_MS = 800

/** Call `tick` every `ms` while `playing`. The caller decides when to stop (usually at the end). */
export function useAutoAdvance(playing: boolean, tick: () => void, ms = PLAY_INTERVAL_MS): void {
  // Always call the latest `tick` without restarting the timer when the callback changes.
  const latest = useRef(tick)
  useEffect(() => {
    latest.current = tick
  })

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => latest.current(), ms)
    return () => clearInterval(t)
  }, [playing, ms])
}
