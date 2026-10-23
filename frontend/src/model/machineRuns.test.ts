import { describe, expect, it } from 'vitest'
import type { TmStep } from '../api/types'
import {
  inputSplit,
  pdaOutcome,
  stackCells,
  tapeAt,
  tapeText,
  tapeWindow,
  tmOutcome,
} from './machineRuns'

const step = (index: number, over: Partial<TmStep> = {}): TmStep => ({
  index,
  state: 'q',
  head: 0,
  transition: index === 0 ? null : 0,
  read: null,
  write: null,
  cell: null,
  note: '',
  ...over,
})

// Increment "1" -> "10": scan right, then carry left writing 0 and finally 1 at cell -1.
const increment: TmStep[] = [
  step(0),
  step(1, { head: 1, read: '1', write: '1', cell: 0 }),
  step(2, { head: 0, read: '_', write: '_', cell: 1 }),
  step(3, { head: -1, read: '1', write: '0', cell: 0 }),
  step(4, { head: -1, read: '_', write: '1', cell: -1 }),
]

describe('tapeAt', () => {
  it('starts with the input at cells 0, 1, 2…', () => {
    expect([...tapeAt('101', '_', increment, 0)]).toEqual([
      [0, '1'],
      [1, '0'],
      [2, '1'],
    ])
  })

  it('replays the writes up to the chosen step', () => {
    expect(tapeText(tapeAt('1', '_', increment, 3), '_')).toBe('0')
    expect(tapeText(tapeAt('1', '_', increment, 4), '_')).toBe('10')
  })

  it('writing a blank erases the cell', () => {
    const steps = [step(0), step(1, { cell: 0, write: '_', head: 1 })]
    expect(tapeAt('a', '_', steps, 1).size).toBe(0)
  })

  it('clamps an out-of-range step and ignores steps that wrote nothing', () => {
    expect(tapeText(tapeAt('1', '_', increment, 99), '_')).toBe('10')
    expect(tapeText(tapeAt('1', '_', increment, -3), '_')).toBe('1')
  })

  it('does not change the steps it is given', () => {
    const copy = JSON.stringify(increment)
    tapeAt('1', '_', increment, 4)
    expect(JSON.stringify(increment)).toBe(copy)
  })
})

describe('tapeWindow', () => {
  const tape = new Map([
    [0, 'a'],
    [1, 'b'],
  ])

  it('centres an odd-width window on the head and marks it', () => {
    const w = tapeWindow(tape, 1, '_', 5)
    expect(w.map((c) => c.index)).toEqual([-1, 0, 1, 2, 3])
    expect(w.map((c) => c.symbol)).toEqual(['_', 'a', 'b', '_', '_'])
    expect(w.filter((c) => c.isHead).map((c) => c.index)).toEqual([1])
  })

  it('shows blanks beyond the written part, including to the left of cell 0', () => {
    expect(tapeWindow(tape, -10, '_', 3).every((c) => c.symbol === '_')).toBe(true)
  })

  it('defaults to 21 cells', () => {
    expect(tapeWindow(tape, 0, '_')).toHaveLength(21)
  })
})

describe('tapeText', () => {
  it('is empty for an all-blank tape', () => {
    expect(tapeText(new Map(), '_')).toBe('')
  })

  it('keeps blanks that lie between symbols', () => {
    expect(
      tapeText(
        new Map([
          [0, 'a'],
          [2, 'b'],
        ]),
        '_',
      ),
    ).toBe('a_b')
  })
})

describe('pushdown helpers', () => {
  it('lists the stack from the top down', () => {
    expect(stackCells('AZ')).toEqual(['A', 'Z'])
    expect(stackCells('')).toEqual([])
  })

  it('splits the input into what has been read and what remains', () => {
    expect(inputSplit('aabb', 1)).toEqual({ read: 'a', rest: 'abb' })
    expect(inputSplit('ab', 0)).toEqual({ read: '', rest: 'ab' })
    expect(inputSplit('ab', 2)).toEqual({ read: 'ab', rest: '' })
  })
})

describe('verdict wording', () => {
  it('says a PDA limit is not a rejection', () => {
    expect(pdaOutcome('limit', 'a stack grew taller than 200 symbols')).toMatch(/not a rejection/)
    expect(pdaOutcome('rejected', '')).toMatch(/every possible computation/)
    expect(pdaOutcome('accepted', '')).toMatch(/^Accepted/)
  })

  it('says a Turing machine step limit may mean it never halts', () => {
    expect(tmOutcome('limit', 'stopped after 10000 steps')).toMatch(/may run forever/)
    expect(tmOutcome('rejected', 'no transition from q0 on x')).toBe(
      'Rejected: no transition from q0 on x.',
    )
  })
})
