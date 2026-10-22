import type { Automaton } from '../api/types'

export class ParseError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

/**
 * Check that parsed JSON has the canonical automaton shape. Only the structure is checked;
 * semantic problems (unknown symbols, dangling references) are the validator's job, so a
 * flawed file can still be opened and fixed.
 */
export function parseAutomaton(text: string): Automaton {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ParseError('This file is not valid JSON.')
  }
  return parseAutomatonValue(raw)
}

/** Same checks as `parseAutomaton`, for a value that is already parsed JSON. */
export function parseAutomatonValue(raw: unknown): Automaton {
  if (!isObj(raw)) throw new ParseError('Expected a JSON object.')
  if (raw.schemaVersion !== 1) throw new ParseError('Unsupported schemaVersion (expected 1).')
  if (raw.kind !== 'DFA' && raw.kind !== 'NFA' && raw.kind !== 'ENFA') {
    throw new ParseError('"kind" must be DFA, NFA or ENFA.')
  }
  if (!isStrArr(raw.alphabet) || !raw.alphabet.every((s) => [...s].length === 1)) {
    throw new ParseError('"alphabet" must be a list of single characters.')
  }
  if (!Array.isArray(raw.states) || !raw.states.every((s) => isObj(s) && isStr(s.id))) {
    throw new ParseError('"states" must be a list of objects with an id.')
  }
  if (raw.start !== null && !isStr(raw.start))
    throw new ParseError('"start" must be a state id or null.')
  if (!isStrArr(raw.accepting)) throw new ParseError('"accepting" must be a list of state ids.')
  if (
    !Array.isArray(raw.transitions) ||
    !raw.transitions.every(
      (t) => isObj(t) && isStr(t.from) && isStr(t.to) && (t.symbol === null || isStr(t.symbol)),
    )
  ) {
    throw new ParseError('"transitions" must be a list of {from, to, symbol} objects.')
  }
  const ids = (raw.states as { id: string }[]).map((s) => s.id)
  if (new Set(ids).size !== ids.length) throw new ParseError('State ids must be unique.')

  return {
    schemaVersion: 1,
    kind: raw.kind,
    name: isStr(raw.name) ? raw.name : '',
    alphabet: raw.alphabet,
    states: (raw.states as Record<string, unknown>[]).map((s) => {
      const pos = s.position
      const hasPos = isObj(pos) && typeof pos.x === 'number' && typeof pos.y === 'number'
      return {
        id: s.id as string,
        label: isStr(s.label) ? s.label : (s.id as string),
        ...(hasPos ? { position: { x: pos.x as number, y: pos.y as number } } : {}),
      }
    }),
    start: raw.start,
    accepting: raw.accepting,
    transitions: (raw.transitions as Automaton['transitions']).map((t) => ({
      from: t.from,
      to: t.to,
      symbol: t.symbol,
    })),
  }
}

export const serializeAutomaton = (doc: Automaton): string => JSON.stringify(doc, null, 2) + '\n'
