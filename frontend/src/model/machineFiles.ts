import type { Pda, Tm } from '../api/types'
import { ParseError } from './serialize'

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const oneChar = (v: unknown): v is string => isStr(v) && [...v].length === 1

function common(raw: unknown, what: string): Record<string, unknown> {
  if (!isObj(raw)) throw new ParseError('Expected a JSON object.')
  if (raw.schemaVersion !== 1) throw new ParseError('Unsupported schemaVersion (expected 1).')
  if (!isStrArr(raw.inputAlphabet) || !raw.inputAlphabet.every(oneChar)) {
    throw new ParseError('"inputAlphabet" must be a list of single characters.')
  }
  if (!Array.isArray(raw.states) || !raw.states.every((s) => isObj(s) && isStr(s.id))) {
    throw new ParseError('"states" must be a list of objects with an id.')
  }
  const ids = (raw.states as { id: string }[]).map((s) => s.id)
  if (new Set(ids).size !== ids.length) throw new ParseError('State ids must be unique.')
  if (raw.start !== null && !isStr(raw.start))
    throw new ParseError('"start" must be a state id or null.')
  if (!isStrArr(raw.accepting)) throw new ParseError('"accepting" must be a list of state ids.')
  if (!Array.isArray(raw.transitions))
    throw new ParseError(`"transitions" must be a list for a ${what}.`)
  return raw
}

const states = (raw: Record<string, unknown>) =>
  (raw.states as Record<string, unknown>[]).map((s) => ({
    id: s.id as string,
    label: isStr(s.label) ? s.label : (s.id as string),
  }))

/** Check that parsed JSON is a pushdown automaton. Meaning (unknown symbols, …) is the validator's job. */
export function parsePdaValue(value: unknown): Pda {
  const raw = common(value, 'pushdown automaton')
  if (!isStrArr(raw.stackAlphabet) || !raw.stackAlphabet.every(oneChar)) {
    throw new ParseError('"stackAlphabet" must be a list of single characters.')
  }
  if (!isStr(raw.startStack) || [...raw.startStack].length > 1) {
    throw new ParseError('"startStack" must be one symbol, or empty.')
  }
  if (raw.acceptBy !== 'finalState' && raw.acceptBy !== 'emptyStack') {
    throw new ParseError('"acceptBy" must be finalState or emptyStack.')
  }
  const ok = (raw.transitions as unknown[]).every(
    (t) =>
      isObj(t) &&
      isStr(t.from) &&
      isStr(t.to) &&
      (t.input === null || oneChar(t.input)) &&
      (t.pop === null || oneChar(t.pop)) &&
      isStr(t.push),
  )
  if (!ok) throw new ParseError('Each transition needs from, to, input, pop and push.')
  return {
    schemaVersion: 1,
    name: isStr(raw.name) ? raw.name : '',
    inputAlphabet: raw.inputAlphabet as string[],
    stackAlphabet: raw.stackAlphabet as string[],
    startStack: raw.startStack,
    acceptBy: raw.acceptBy,
    states: states(raw),
    start: raw.start as string | null,
    accepting: raw.accepting as string[],
    transitions: (raw.transitions as Pda['transitions']).map((t) => ({
      from: t.from,
      to: t.to,
      input: t.input,
      pop: t.pop,
      push: t.push,
    })),
  }
}

/** Check that parsed JSON is a Turing machine. */
export function parseTmValue(value: unknown): Tm {
  const raw = common(value, 'Turing machine')
  if (!isStrArr(raw.tapeAlphabet) || !raw.tapeAlphabet.every(oneChar)) {
    throw new ParseError('"tapeAlphabet" must be a list of single characters.')
  }
  if (!oneChar(raw.blank)) throw new ParseError('"blank" must be a single character.')
  if (!isStrArr(raw.rejecting)) throw new ParseError('"rejecting" must be a list of state ids.')
  const ok = (raw.transitions as unknown[]).every(
    (t) =>
      isObj(t) &&
      isStr(t.from) &&
      isStr(t.to) &&
      oneChar(t.read) &&
      oneChar(t.write) &&
      (t.move === 'L' || t.move === 'R' || t.move === 'S'),
  )
  if (!ok)
    throw new ParseError('Each transition needs from, to, read, write and a move of L, R or S.')
  return {
    schemaVersion: 1,
    name: isStr(raw.name) ? raw.name : '',
    inputAlphabet: raw.inputAlphabet as string[],
    tapeAlphabet: raw.tapeAlphabet as string[],
    blank: raw.blank,
    states: states(raw),
    start: raw.start as string | null,
    accepting: raw.accepting as string[],
    rejecting: raw.rejecting as string[],
    transitions: (raw.transitions as Tm['transitions']).map((t) => ({
      from: t.from,
      to: t.to,
      read: t.read,
      write: t.write,
      move: t.move,
    })),
  }
}

function json(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ParseError('This file is not valid JSON.')
  }
}

export const parsePda = (text: string): Pda => parsePdaValue(json(text))
export const parseTm = (text: string): Tm => parseTmValue(json(text))
export const serializeMachine = (m: Pda | Tm): string => JSON.stringify(m, null, 2) + '\n'
