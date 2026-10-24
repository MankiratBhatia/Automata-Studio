import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Root from '../Root'
import { EXAMPLES } from '../examples'
import { useMode } from '../mode'
import {
  ALGORITHMS_URL,
  CAPABILITIES,
  HERO_EXAMPLE_ID,
  HERO_INPUT,
  HERO_TRACE,
  MACHINES,
  PIPELINE,
  REPO_URL,
  STEPS,
} from './content'
import { HeroDemo } from './HeroDemo'
import { LandingPage } from './LandingPage'

beforeEach(() => {
  window.location.hash = ''
  useMode.setState({ mode: 'pda' }) // so a launch visibly resets it
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

describe('the page', () => {
  it('leads with the required heading, description and a prominent Launch Studio button', () => {
    render(<LandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Build. Simulate. Understand.',
    )
    expect(
      screen.getByText(/hands-on tool for the machines in a theory of computation course/),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Launch Studio/ }).length).toBeGreaterThanOrEqual(3)
  })

  it('has the landmarks and one level-2 heading per section', () => {
    render(<LandingPage />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(h2).toEqual([
      'Three kinds of machine, one studio',
      'What you can do',
      'How it works',
      'Ready to try it?',
    ])
  })

  it('showcases the three kinds of machine', () => {
    render(<LandingPage />)
    for (const m of MACHINES) {
      expect(screen.getByRole('heading', { level: 3, name: m.title })).toBeInTheDocument()
      for (const p of m.points) expect(screen.getByText(p)).toBeInTheDocument()
    }
    expect(MACHINES.map((m) => m.mode)).toEqual(['fa', 'pda', 'tm'])
  })

  it('lists every capability and the conversion pipeline in order', () => {
    render(<LandingPage />)
    for (const c of CAPABILITIES)
      expect(screen.getByRole('heading', { name: c.title })).toBeInTheDocument()
    const stages = within(screen.getByRole('list', { name: 'Conversion pipeline' })).getAllByRole(
      'listitem',
    )
    expect(stages.map((s) => s.textContent)).toEqual(
      [
        'Regular expression→Thompson’s construction',
        'ε-NFA→ε-removal',
        'NFA→subset construction',
        'DFA→partition refinement',
        'Minimal DFA',
      ].map((t) => expect.stringContaining(t.split('→')[0])),
    )
    expect(PIPELINE.map((p) => p.label)).toEqual([
      'Regular expression',
      'ε-NFA',
      'NFA',
      'DFA',
      'Minimal DFA',
    ])
  })

  it('explains how it works in numbered steps', () => {
    render(<LandingPage />)
    const steps = within(
      screen.getByRole('heading', { name: 'How it works' }).closest('section')!,
    ).getAllByRole('listitem')
    expect(steps).toHaveLength(STEPS.length)
    expect(steps[0]).toHaveTextContent('Build or load')
  })

  it('has a footer with working links', () => {
    render(<LandingPage />)
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'href',
      REPO_URL,
    )
    expect(footer.getByRole('link', { name: 'How the algorithms work' })).toHaveAttribute(
      'href',
      ALGORITHMS_URL,
    )
    expect(footer.getByRole('link', { name: 'Launch Studio' })).toHaveAttribute('href', '#/studio')
    // Links that leave the site do not hand the new page a handle back to this one.
    expect(footer.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
      'rel',
      expect.stringContaining('noreferrer'),
    )
  })

  it('only claims what the studio does: no claims about accounts, sharing or accuracy numbers', () => {
    render(<LandingPage />)
    const text = document.body.textContent ?? ''
    for (const word of ['cloud', 'collaborat', 'AI', 'sign in', 'subscription', 'trusted by']) {
      expect(text).not.toContain(word)
    }
  })
})

describe('navigation', () => {
  it('every Launch Studio link opens the studio on the finite-automata screen', async () => {
    render(<LandingPage />)
    for (const link of screen.getAllByRole('link', { name: /Launch Studio/ })) {
      window.location.hash = ''
      useMode.setState({ mode: 'tm' })
      await userEvent.click(link)
      expect(window.location.hash).toBe('#/studio')
      expect(useMode.getState().mode).toBe('fa')
    }
  })

  it.each([
    ['Open finite automata', 'fa'],
    ['Open pushdown automata', 'pda'],
    ['Open Turing machines', 'tm'],
  ] as const)('"%s" opens the studio on the %s screen', async (name, mode) => {
    useMode.setState({ mode: mode === 'fa' ? 'tm' : 'fa' })
    render(<LandingPage />)
    await userEvent.click(screen.getByRole('button', { name }))
    expect(window.location.hash).toBe('#/studio')
    expect(useMode.getState().mode).toBe(mode)
  })

  it('the section links scroll to their heading and move focus there', async () => {
    render(<LandingPage />)
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Page sections' })).getByRole('button', {
        name: 'How it works',
      }),
    )
    const heading = screen.getByRole('heading', { name: 'How it works' })
    expect(heading).toHaveFocus()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('"Explore features" scrolls to the machines section', async () => {
    render(<LandingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Explore features' }))
    expect(
      screen.getByRole('heading', { name: 'Three kinds of machine, one studio' }),
    ).toHaveFocus()
  })

  it('"Skip to content" moves focus into the main area', async () => {
    render(<LandingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Skip to content' }))
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('has a theme control', () => {
    render(<LandingPage />)
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument()
  })
})

describe('Root', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ status: 'ok', version: '0.1.0', issues: [] })),
      ),
    )
  })

  it('shows the landing page at the bare address and for unknown ones', () => {
    render(<Root />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Build. Simulate. Understand.',
    )
    expect(screen.queryByRole('combobox', { name: 'Load example' })).toBeNull()
  })

  it('shows the studio at #/studio, with the existing editor intact', () => {
    window.location.hash = '#/studio'
    useMode.setState({ mode: 'fa' })
    render(<Root />)
    expect(screen.getByRole('combobox', { name: 'Load example' })).toBeInTheDocument()
    for (const tab of ['Edit', 'Validate', 'Simulate', 'Convert', 'Steps', 'Compare']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument()
    }
    expect(screen.queryByRole('heading', { name: 'Three kinds of machine, one studio' })).toBeNull()
  })

  it('goes from the landing page to the studio and back, as the address changes', async () => {
    useMode.setState({ mode: 'fa' })
    render(<Root />)
    await userEvent.click(screen.getAllByRole('link', { name: /Launch Studio/ })[0])
    expect(await screen.findByRole('combobox', { name: 'Load example' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Automata Studio' })) // the title in the header
    expect(
      await screen.findByRole('heading', { level: 1, name: /Build\. Simulate\. Understand\./ }),
    ).toBeInTheDocument()
  })

  it('starts each page at the top', () => {
    const scroll = vi.fn()
    vi.stubGlobal('scrollTo', scroll)
    render(<Root />)
    expect(scroll).toHaveBeenCalledWith(0, 0)
  })
})

describe('the hero animation', () => {
  const example = EXAMPLES.find((e) => e.id === HERO_EXAMPLE_ID)!.automaton

  it('is the studio example the page says it is', () => {
    expect(example.name).toBe('Ends with 01')
    expect(example.kind).toBe('DFA')
  })

  it('shows a trace that is exactly what the automaton does on that input', () => {
    // Walk the example's own transition table, independently of the page.
    let state = example.start!
    expect(HERO_TRACE[0]).toEqual({ state, transition: null })
    ;[...HERO_INPUT].forEach((symbol, i) => {
      const index = example.transitions.findIndex((t) => t.from === state && t.symbol === symbol)
      state = example.transitions[index].to
      expect(HERO_TRACE[i + 1]).toEqual({ state, transition: index })
    })
    expect(example.accepting).toContain(state) // so the demo really ends in "Accepted"
  })

  it('reads one more symbol on each tick and ends on Accepted', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
    render(<HeroDemo />)
    const tape = () => screen.getByRole('img', { name: /Input 1101/ })
    expect(tape()).toHaveAccessibleName('Input 1101, 0 symbols read')
    expect(screen.getByText('Reading…')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1100))
    expect(tape()).toHaveAccessibleName('Input 1101, 1 symbols read')
    act(() => void vi.advanceTimersByTime(1100 * 3))
    expect(tape()).toHaveAccessibleName('Input 1101, 4 symbols read')
    expect(screen.getByText('Accepted')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('can be paused, and stays put while paused', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }))
    render(<HeroDemo />)
    const button = screen.getByRole('button', { name: 'Pause' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    act(() => fireEvent.click(button))
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true')
    act(() => void vi.advanceTimersByTime(10_000))
    expect(screen.getByRole('img', { name: /Input 1101/ })).toHaveAccessibleName(
      'Input 1101, 0 symbols read',
    )
    vi.useRealTimers()
  })

  it('with reduced motion it starts paused on the finished run', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {} }))
    render(<HeroDemo />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByText('Accepted')).toBeInTheDocument()
  })
})
