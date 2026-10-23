import { ApiError } from './client'

/** A user-facing sentence for whatever went wrong when talking to the backend. */
export function describeError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'INVALID_AUTOMATON') {
    return `Fix the machine first: ${e.issues.map((i) => i.message).join(' ')}`
  }
  return e instanceof Error ? e.message : 'Something went wrong.'
}
