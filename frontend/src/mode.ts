import { create } from 'zustand'

export type Mode = 'fa' | 'pda' | 'tm'

export const MODES: { id: Mode; label: string }[] = [
  { id: 'fa', label: 'Finite automata' },
  { id: 'pda', label: 'Pushdown automata' },
  { id: 'tm', label: 'Turing machines' },
]

const KEY = 'automata-studio:mode'

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'pda' || v === 'tm' ? v : 'fa'
  } catch {
    return 'fa'
  }
}

/** Which kind of machine the workspace is showing. */
export const useMode = create<{ mode: Mode; setMode: (m: Mode) => void }>()((set) => ({
  mode: read(),
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      // Storage can be blocked; the choice then lasts for this session only.
    }
    set({ mode })
  },
}))
