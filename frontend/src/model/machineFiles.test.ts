import { describe, expect, it } from 'vitest'
import { PDA_EXAMPLES, TM_EXAMPLES } from '../machines/examples'
import { parsePda, parseTm, serializeMachine } from './machineFiles'
import { ParseError } from './serialize'

const pdaJson = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({ ...PDA_EXAMPLES[0].machine, ...patch })
const tmJson = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({ ...TM_EXAMPLES[0].machine, ...patch })

describe('round trips', () => {
  it.each(PDA_EXAMPLES.map((e) => [e.id, e.machine] as const))('PDA %s', (_id, m) => {
    expect(parsePda(serializeMachine(m))).toEqual(m)
  })

  it.each(TM_EXAMPLES.map((e) => [e.id, e.machine] as const))('TM %s', (_id, m) => {
    expect(parseTm(serializeMachine(m))).toEqual(m)
  })
})

describe('PDA parsing errors', () => {
  it.each([
    ['not json', '{oops', /not valid JSON/],
    ['an array', '[]', /JSON object/],
    ['a version', pdaJson({ schemaVersion: 2 }), /schemaVersion/],
    ['an input alphabet', pdaJson({ inputAlphabet: ['ab'] }), /inputAlphabet/],
    ['a stack alphabet', pdaJson({ stackAlphabet: 'Z' }), /stackAlphabet/],
    ['a start stack', pdaJson({ startStack: 'ZZ' }), /startStack/],
    ['an acceptance mode', pdaJson({ acceptBy: 'maybe' }), /acceptBy/],
    ['duplicate ids', pdaJson({ states: [{ id: 'x' }, { id: 'x' }] }), /unique/],
    ['a transition', pdaJson({ transitions: [{ from: 'a' }] }), /transition/],
  ])('rejects %s', (_n, text, message) => {
    expect(() => parsePda(text)).toThrow(ParseError)
    expect(() => parsePda(text)).toThrow(message)
  })

  it('accepts an empty initial stack', () => {
    expect(parsePda(pdaJson({ startStack: '' })).startStack).toBe('')
  })

  it('accepts a file with meaning problems so it can be opened and fixed', () => {
    expect(parsePda(pdaJson({ start: 'ghost' })).start).toBe('ghost')
  })

  it('defaults a missing label to the id', () => {
    expect(parsePda(pdaJson({ states: [{ id: 'z' }] })).states).toEqual([{ id: 'z', label: 'z' }])
  })
})

describe('Turing machine parsing errors', () => {
  it.each([
    ['a tape alphabet', tmJson({ tapeAlphabet: [1] }), /tapeAlphabet/],
    ['a blank', tmJson({ blank: '__' }), /blank/],
    ['rejecting states', tmJson({ rejecting: 'q' }), /rejecting/],
    [
      'a move',
      tmJson({ transitions: [{ from: 'a', to: 'b', read: 'a', write: 'a', move: 'UP' }] }),
      /L, R or S/,
    ],
  ])('rejects %s', (_n, text, message) => {
    expect(() => parseTm(text)).toThrow(message)
  })

  it('does not mistake a PDA file for a Turing machine', () => {
    expect(() => parseTm(serializeMachine(PDA_EXAMPLES[0].machine))).toThrow(ParseError)
  })
})
