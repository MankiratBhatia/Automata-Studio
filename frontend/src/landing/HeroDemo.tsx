import { useEffect, useMemo, useState } from 'react'
import { ReadOnlyCanvas } from '../canvas/ReadOnlyCanvas'
import { InputTape } from '../components/InputTape'
import { EXAMPLES } from '../examples'
import { HERO_EXAMPLE_ID, HERO_INPUT, HERO_TRACE } from './content'
import { prefersReducedMotion } from './motion'

const TICK_MS = 1100
// After the last symbol the final state is held for a few ticks before the loop restarts.
const HOLD_TICKS = 3

/**
 * The studio's own "Ends with 01" automaton, reading 1101 in a loop. It is the real renderer,
 * not a picture, so the landing page looks exactly like the tool. Motion can be paused (and
 * starts paused for people who ask their system for reduced motion).
 */
export function HeroDemo() {
  const example = EXAMPLES.find((e) => e.id === HERO_EXAMPLE_ID)
  const last = HERO_TRACE.length - 1
  // Someone who asks for reduced motion gets the finished run, held still, until they press Play.
  const [paused, setPaused] = useState(prefersReducedMotion)
  const [tick, setTick] = useState(() => (prefersReducedMotion() ? last : 0))

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setTick((n) => (n + 1) % (last + 1 + HOLD_TICKS)), TICK_MS)
    return () => clearInterval(t)
  }, [paused, last])

  const step = Math.min(tick, last)
  const current = HERO_TRACE[step]
  const view = useMemo(
    () => ({
      activeStates: new Set([current.state]),
      activeTransitions: new Set(current.transition === null ? [] : [current.transition]),
    }),
    [current],
  )

  if (!example) return null
  return (
    <figure
      aria-label="A live preview of the studio"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-blue-900/5 dark:border-slate-700 dark:bg-slate-800"
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5 text-sm dark:border-slate-700">
        <span className="font-medium">
          {example.title} <span className="text-slate-600 dark:text-slate-400">(DFA) reading</span>{' '}
          <code className="font-mono">{HERO_INPUT}</code>
        </span>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          className="btn !px-2.5 !py-0.5 text-xs"
        >
          {paused ? 'Play' : 'Pause'}
        </button>
      </figcaption>
      <div className="h-64 sm:h-72">
        <ReadOnlyCanvas
          doc={example.automaton}
          view={view}
          label="The finite automaton for strings ending in 01"
          interactive={false}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        <InputTape input={HERO_INPUT} position={step} failed={false} />
        <span
          className={`rounded-md px-3 py-1 text-sm font-bold ${
            step === last
              ? 'bg-emerald-700 text-white'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
          }`}
        >
          {step === last ? 'Accepted' : 'Reading…'}
        </span>
      </div>
    </figure>
  )
}
