import { useEffect } from 'react'
import { saveMachines } from './persistence'
import { useMachineStore } from './useMachineStore'

const SAVE_DEBOUNCE_MS = 400

/** Save both machines to localStorage shortly after any change. */
export function useMachineAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useMachineStore.subscribe((state, prev) => {
      if (state.pda === prev.pda && state.tm === prev.tm) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const { pda, tm } = useMachineStore.getState()
        saveMachines({ pda, tm })
      }, SAVE_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])
}
