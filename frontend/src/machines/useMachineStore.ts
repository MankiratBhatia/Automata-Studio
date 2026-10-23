import { create } from 'zustand'
import { runPda, runTm, validatePda, validateTm } from '../api/client'
import { describeError } from '../api/describeError'
import type { Issue, Pda, PdaRunResponse, Tm, TmRunResponse } from '../api/types'
import { PDA_EXAMPLES, TM_EXAMPLES } from './examples'
import { loadMachines } from './persistence'

/** Milliseconds between steps while playing. Fast runs are for long Turing machine computations. */
export const SPEEDS = [
  { id: 'slow', label: 'Slow', ms: 800 },
  { id: 'normal', label: 'Normal', ms: 300 },
  { id: 'fast', label: 'Fast', ms: 60 },
  { id: 'max', label: 'Very fast', ms: 10 },
] as const
export type SpeedId = (typeof SPEEDS)[number]['id']

interface Run<R> {
  input: string
  result: R | null
  step: number
  playing: boolean
  running: boolean
  error: string | null
  speed: SpeedId
}

const idle = <R>(input: string, speed: SpeedId = 'normal'): Run<R> => ({
  input,
  result: null,
  step: 0,
  playing: false,
  running: false,
  error: null,
  speed,
})

type Kind = 'pda' | 'tm'

interface Validation {
  issues: Issue[] | null
  error: string | null
}

interface MachineStore {
  pda: Pda
  tm: Tm
  pdaRun: Run<PdaRunResponse>
  tmRun: Run<TmRunResponse>
  validation: Record<Kind, Validation>
  /** What the last load replaced, so "Undo load" can bring it back. */
  previous: { pda: Pda | null; tm: Tm | null }

  /** Apply an edit. A finished run described the old machine, so it is discarded. */
  editPda: (f: (p: Pda) => Pda) => void
  editTm: (f: (t: Tm) => Tm) => void
  loadPda: (p: Pda) => void
  loadTm: (t: Tm) => void
  restorePrevious: (kind: Kind) => void
  setValidation: (kind: Kind, issues: Issue[] | null, error?: string | null) => void

  setInput: (kind: Kind, input: string) => void
  setSpeed: (kind: Kind, speed: SpeedId) => void
  run: (kind: Kind) => Promise<void>
  gotoStep: (kind: Kind, n: number) => void
  setPlaying: (kind: Kind, playing: boolean) => void
}

const firstOf = <M extends { id: string }>(list: M[], id: string): M =>
  list.find((e) => e.id === id) ?? list[0]

export const useMachineStore = create<MachineStore>()((set, get) => {
  const saved = loadMachines()
  const pda = saved.pda ?? firstOf(PDA_EXAMPLES, 'pda_anbn_final').machine
  const tm = saved.tm ?? firstOf(TM_EXAMPLES, 'tm_increment').machine
  const none: Validation = { issues: null, error: null }

  const runLength = (kind: Kind): number => {
    const { pdaRun, tmRun } = get()
    return (kind === 'pda' ? pdaRun.result?.steps.length : tmRun.result?.steps.length) ?? 1
  }

  return {
    pda,
    tm,
    pdaRun: idle(''),
    tmRun: idle(''),
    validation: { pda: none, tm: none },
    previous: { pda: null, tm: null },

    editPda: (f) =>
      set((st) => ({ pda: f(st.pda), pdaRun: idle(st.pdaRun.input, st.pdaRun.speed) })),
    editTm: (f) => set((st) => ({ tm: f(st.tm), tmRun: idle(st.tmRun.input, st.tmRun.speed) })),
    loadPda: (p) =>
      set((st) => ({
        pda: p,
        pdaRun: idle('', st.pdaRun.speed),
        previous: { ...st.previous, pda: st.pda },
      })),
    loadTm: (t) =>
      set((st) => ({
        tm: t,
        tmRun: idle('', st.tmRun.speed),
        previous: { ...st.previous, tm: st.tm },
      })),
    restorePrevious: (kind) =>
      set((st) => {
        const back = st.previous[kind]
        if (!back) return {}
        return kind === 'pda'
          ? {
              pda: back as Pda,
              pdaRun: idle('', st.pdaRun.speed),
              previous: { ...st.previous, pda: null },
            }
          : {
              tm: back as Tm,
              tmRun: idle('', st.tmRun.speed),
              previous: { ...st.previous, tm: null },
            }
      }),
    setValidation: (kind, issues, error = null) =>
      set((st) => ({ validation: { ...st.validation, [kind]: { issues, error } } })),

    setInput: (kind, input) =>
      set((st) =>
        kind === 'pda'
          ? { pdaRun: idle(input, st.pdaRun.speed) }
          : { tmRun: idle(input, st.tmRun.speed) },
      ),
    setSpeed: (kind, speed) =>
      set((st) =>
        kind === 'pda' ? { pdaRun: { ...st.pdaRun, speed } } : { tmRun: { ...st.tmRun, speed } },
      ),

    run: async (kind) => {
      const st = get()
      if (kind === 'pda') {
        const { pda: machine, pdaRun } = st
        set({ pdaRun: { ...idle(pdaRun.input, pdaRun.speed), running: true } })
        try {
          const result = await runPda(machine, pdaRun.input)
          // Ignore an answer for a machine or input that has changed while we waited.
          if (get().pda !== machine || get().pdaRun.input !== pdaRun.input) return
          set((s) => ({ pdaRun: { ...idle(s.pdaRun.input, s.pdaRun.speed), result } }))
        } catch (e) {
          if (get().pda !== machine) return
          set((s) => ({
            pdaRun: { ...idle(s.pdaRun.input, s.pdaRun.speed), error: describeError(e) },
          }))
        }
      } else {
        const { tm: machine, tmRun } = st
        set({ tmRun: { ...idle(tmRun.input, tmRun.speed), running: true } })
        try {
          const result = await runTm(machine, tmRun.input)
          if (get().tm !== machine || get().tmRun.input !== tmRun.input) return
          set((s) => ({ tmRun: { ...idle(s.tmRun.input, s.tmRun.speed), result } }))
        } catch (e) {
          if (get().tm !== machine) return
          set((s) => ({
            tmRun: { ...idle(s.tmRun.input, s.tmRun.speed), error: describeError(e) },
          }))
        }
      }
    },

    gotoStep: (kind, n) => {
      const last = runLength(kind) - 1
      const step = Math.max(0, Math.min(n, last))
      set((st) =>
        kind === 'pda'
          ? { pdaRun: { ...st.pdaRun, step, playing: st.pdaRun.playing && step < last } }
          : { tmRun: { ...st.tmRun, step, playing: st.tmRun.playing && step < last } },
      )
    },
    setPlaying: (kind, playing) =>
      set((st) =>
        kind === 'pda'
          ? { pdaRun: { ...st.pdaRun, playing } }
          : { tmRun: { ...st.tmRun, playing } },
      ),
  }
})

/** Checks a machine with the backend, debounced, whenever it changes. */
export async function validateMachine(kind: Kind): Promise<void> {
  const st = useMachineStore.getState()
  try {
    const res = kind === 'pda' ? await validatePda(st.pda) : await validateTm(st.tm)
    useMachineStore.getState().setValidation(kind, res.issues)
  } catch (e) {
    useMachineStore
      .getState()
      .setValidation(kind, null, e instanceof Error ? e.message : 'Unknown error')
  }
}
