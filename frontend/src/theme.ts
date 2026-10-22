import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'automata-studio:theme'
const PREFS: readonly ThemePref[] = ['system', 'light', 'dark']

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return PREFS.includes(v as ThemePref) ? (v as ThemePref) : 'system'
  } catch {
    return 'system'
  }
}

const prefersDark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

export const resolveDark = (pref: ThemePref): boolean =>
  pref === 'dark' || (pref === 'system' && prefersDark())

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}

interface ThemeState {
  pref: ThemePref
  /** Whether dark mode is actually on (a "system" preference resolves to one or the other). */
  dark: boolean
  setPref: (pref: ThemePref) => void
}

export const useTheme = create<ThemeState>()((set) => {
  const pref = readPref()
  const dark = resolveDark(pref)
  apply(dark)

  // Follow the operating system while the preference is "system".
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const current = useTheme.getState()
      if (current.pref === 'system') {
        const next = resolveDark('system')
        apply(next)
        set({ dark: next })
      }
    })
  }

  return {
    pref,
    dark,
    setPref: (next) => {
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // Storage can be blocked; the choice then lasts for this session only.
      }
      const nextDark = resolveDark(next)
      apply(nextDark)
      set({ pref: next, dark: nextDark })
    },
  }
})
