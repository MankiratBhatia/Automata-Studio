import type { PdaStep, TmStep } from '../api/types'

// --- Turing machine tape ------------------------------------------------------------------

/**
 * The tape as it was after step `k`. The first step is the start; each later step wrote one
 * symbol at the cell the head had just left, so replaying the writes rebuilds any moment.
 * Blank cells are simply absent.
 */
export function tapeAt(
  input: string,
  blank: string,
  steps: readonly TmStep[],
  k: number,
): Map<number, string> {
  const tape = new Map<number, string>()
  ;[...input].forEach((c, i) => tape.set(i, c))
  for (const s of steps.slice(1, Math.max(0, k) + 1)) {
    if (s.cell === null || s.cell === undefined || s.write === null || s.write === undefined)
      continue
    if (s.write === blank) tape.delete(s.cell)
    else tape.set(s.cell, s.write)
  }
  return tape
}

export interface TapeCell {
  index: number
  symbol: string
  isHead: boolean
}

/** `width` cells centred on the head (an odd width keeps the head in the middle). */
export function tapeWindow(
  tape: ReadonlyMap<number, string>,
  head: number,
  blank: string,
  width = 21,
): TapeCell[] {
  const left = head - Math.floor(width / 2)
  return Array.from({ length: width }, (_, i) => ({
    index: left + i,
    symbol: tape.get(left + i) ?? blank,
    isHead: left + i === head,
  }))
}

/** The non-blank part of a tape, as text (blanks inside it are kept). */
export function tapeText(tape: ReadonlyMap<number, string>, blank: string): string {
  const cells = [...tape.keys()]
  if (cells.length === 0) return ''
  const lo = Math.min(...cells)
  const hi = Math.max(...cells)
  return Array.from({ length: hi - lo + 1 }, (_, i) => tape.get(lo + i) ?? blank).join('')
}

// --- pushdown stack and input -------------------------------------------------------------

/** Stack symbols from the top down: "AZ" is A on top of Z. */
export const stackCells = (stack: string): string[] => [...stack]

/** How much of the input has been read, and what remains. */
export const inputSplit = (input: string, position: number): { read: string; rest: string } => ({
  read: input.slice(0, position),
  rest: input.slice(position),
})

// --- what the verdicts mean, in words -----------------------------------------------------

export function pdaOutcome(verdict: 'accepted' | 'rejected' | 'limit', reason: string): string {
  if (verdict === 'accepted')
    return 'Accepted: some computation reads the whole input and meets the acceptance condition.'
  if (verdict === 'rejected')
    return 'Rejected: every possible computation was tried and none accepts.'
  return `Undecided: ${reason}. A longer search might find an accepting computation, so this is not a rejection.`
}

export function tmOutcome(status: 'accepted' | 'rejected' | 'limit', reason: string): string {
  if (status === 'accepted') return `Accepted: ${reason}.`
  if (status === 'rejected') return `Rejected: ${reason}.`
  return `Step limit reached: ${reason}. It may halt later or may run forever.`
}

/** Highlight data for one step of a PDA run: which state is current and which move was just made. */
export const currentOf = (steps: readonly PdaStep[], k: number): PdaStep | undefined =>
  steps[Math.max(0, Math.min(k, steps.length - 1))]
