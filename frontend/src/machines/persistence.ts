import type { Pda, Tm } from '../api/types'
import { parsePdaValue, parseTmValue } from '../model/machineFiles'

const KEY = 'automata-studio:machines:v1'

export interface SavedMachines {
  pda: Pda | null
  tm: Tm | null
}

// Storage can be missing or throw (private windows, blocked site data), and what is in it may be
// stale or damaged, so every read is guarded and each machine is checked on its own.

export function loadMachines(): SavedMachines {
  const out: SavedMachines = { pda: null, tm: null }
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      const o = raw as { pda?: unknown; tm?: unknown }
      try {
        if (o.pda) out.pda = parsePdaValue(o.pda)
      } catch {
        // A damaged saved PDA is dropped; the Turing machine below may still be fine.
      }
      try {
        if (o.tm) out.tm = parseTmValue(o.tm)
      } catch {
        // Likewise for the Turing machine.
      }
    }
  } catch {
    // Unreadable storage: start from the examples.
  }
  return out
}

export function saveMachines(m: { pda: Pda; tm: Tm }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m))
  } catch (e) {
    console.warn('Could not autosave machines', e)
  }
}
