import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { ParseError, parseAutomaton, serializeAutomaton } from './serialize'
import { autoLayout, ensurePositions, NODE_SIZE } from './layout'

describe('export -> import', () => {
  it.each(EXAMPLES.map((e) => [e.id, e.automaton] as const))(
    'round-trips %s unchanged',
    (_id, doc) => {
      expect(parseAutomaton(serializeAutomaton(doc))).toEqual(doc)
    },
  )
})

describe('parseAutomaton errors', () => {
  const base = EXAMPLES[0].automaton
  const withField = (patch: Record<string, unknown>) => JSON.stringify({ ...base, ...patch })

  it.each([
    ['not json', '{oops', /not valid JSON/],
    ['array', '[]', /JSON object/],
    ['version', withField({ schemaVersion: 2 }), /schemaVersion/],
    ['kind', withField({ kind: 'PDA' }), /kind/],
    ['alphabet', withField({ alphabet: ['ab'] }), /single characters/],
    ['transitions', withField({ transitions: [{ from: 'a' }] }), /transitions/],
    ['dup ids', withField({ states: [{ id: 'x' }, { id: 'x' }] }), /unique/],
  ])('rejects %s', (_n, text, message) => {
    expect(() => parseAutomaton(text)).toThrow(ParseError)
    expect(() => parseAutomaton(text)).toThrow(message)
  })

  it('accepts a file with semantic problems so it can be opened and fixed', () => {
    const doc = parseAutomaton(withField({ start: 'ghost' }))
    expect(doc.start).toBe('ghost')
  })

  it('defaults a missing label to the id and a missing position to none', () => {
    const doc = parseAutomaton(withField({ states: [{ id: 'z' }] }))
    expect(doc.states[0]).toEqual({ id: 'z', label: 'z' })
  })
})

describe('layout', () => {
  it('gives every state a distinct position, flowing left to right', () => {
    const doc = autoLayout(EXAMPLES.find((e) => e.id === 'enfa_abb_thompson')!.automaton)
    const pts = doc.states.map((s) => s.position!)
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(doc.states.length)
    expect(doc.states.find((s) => s.id === '10')!.position!.x).toBeGreaterThan(
      doc.states.find((s) => s.id === '0')!.position!.x,
    )
  })

  it('never overlaps two nodes', () => {
    for (const e of EXAMPLES) {
      const pts = e.automaton.states.map((s) => s.position!)
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++) {
          const apart =
            Math.abs(pts[i].x - pts[j].x) >= NODE_SIZE || Math.abs(pts[i].y - pts[j].y) >= NODE_SIZE
          expect(apart, `${e.id}: ${i} vs ${j}`).toBe(true)
        }
    }
  })

  it('leaves positioned automata alone', () => {
    const doc = EXAMPLES[0].automaton
    expect(ensurePositions(doc)).toBe(doc)
  })
})

describe('examples gallery', () => {
  it('loads the six textbook examples and not the expectations file', () => {
    expect(EXAMPLES.length).toBe(7)
    expect(EXAMPLES.some((e) => e.id === 'expectations')).toBe(false)
  })
})
