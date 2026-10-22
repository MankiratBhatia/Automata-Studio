import { useEffect, useState } from 'react'
import { getHealth } from './client'

export type BackendStatus =
  | { state: 'checking' }
  | { state: 'connected'; version: string }
  | { state: 'offline'; message: string }

const RETRY_MS = 5000

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>({ state: 'checking' })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      try {
        const h = await getHealth()
        if (!cancelled) setStatus({ state: 'connected', version: h.version })
      } catch (e) {
        if (!cancelled) {
          setStatus({ state: 'offline', message: e instanceof Error ? e.message : 'Unknown error' })
        }
      }
      if (!cancelled) timer = setTimeout(check, RETRY_MS)
    }
    void check()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return status
}
