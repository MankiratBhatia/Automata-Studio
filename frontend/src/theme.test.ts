import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = () => void

/** A controllable stand-in for the OS dark-mode setting. */
function stubSystem(dark: boolean) {
  const listeners: Listener[] = []
  const state = { dark }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return state.dark
      },
      addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    })),
  )
  return {
    flip(to: boolean) {
      state.dark = to
      listeners.forEach((fn) => fn())
    },
  }
}

// The theme store reads storage and the OS when the module loads, so load it fresh each time.
async function load() {
  vi.resetModules()
  return (await import('./theme')).useTheme
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})
afterEach(() => vi.unstubAllGlobals())

describe('theme', () => {
  it('defaults to following the system, and applies it', async () => {
    stubSystem(true)
    const useTheme = await load()
    expect(useTheme.getState()).toMatchObject({ pref: 'system', dark: true })
    expect(document.documentElement).toHaveClass('dark')
  })

  it('is light when the system is light', async () => {
    stubSystem(false)
    const useTheme = await load()
    expect(useTheme.getState().dark).toBe(false)
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('an explicit choice beats the system, and is remembered', async () => {
    stubSystem(true)
    const useTheme = await load()
    useTheme.getState().setPref('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('automata-studio:theme')).toBe('light')

    stubSystem(false)
    const again = await load()
    expect(again.getState()).toMatchObject({ pref: 'light', dark: false })
  })

  it('"dark" stays dark whatever the system says', async () => {
    stubSystem(false)
    const useTheme = await load()
    useTheme.getState().setPref('dark')
    expect(useTheme.getState().dark).toBe(true)
    expect(document.documentElement).toHaveClass('dark')
  })

  it('follows the operating system live while set to "system"', async () => {
    const system = stubSystem(false)
    const useTheme = await load()
    system.flip(true)
    expect(useTheme.getState().dark).toBe(true)
    expect(document.documentElement).toHaveClass('dark')
  })

  it('ignores operating-system changes once you chose a theme', async () => {
    const system = stubSystem(false)
    const useTheme = await load()
    useTheme.getState().setPref('light')
    system.flip(true)
    expect(useTheme.getState().dark).toBe(false)
  })

  it('treats a corrupt stored value as "system"', async () => {
    stubSystem(false)
    localStorage.setItem('automata-studio:theme', 'purple')
    const useTheme = await load()
    expect(useTheme.getState().pref).toBe('system')
  })

  it('still works where matchMedia does not exist', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const useTheme = await load()
    expect(useTheme.getState()).toMatchObject({ pref: 'system', dark: false })
  })
})
