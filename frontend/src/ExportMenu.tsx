import { useEffect, useRef, useState } from 'react'
import { exportCanvas, type ImageFormat } from './canvas/exportImage'
import { downloadDataUrl, downloadText } from './download'
import { fileStem, transitionTable, type TableFormat } from './model/export'
import { serializeAutomaton } from './model/serialize'
import { useStudioStore } from './store/useStudioStore'

/** A disclosure menu: one button that reveals the export choices. */
export function ExportMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toast = useStudioStore.getState().showToast
  const doc = () => useStudioStore.getState().doc
  const done = (what: string) => {
    setOpen(false)
    toast('success', `Exported ${what}.`)
  }

  const asJson = () => {
    downloadText(`${fileStem(doc().name)}.json`, serializeAutomaton(doc()), 'application/json')
    done('the automaton file')
  }
  const asTable = (format: TableFormat) => {
    const d = doc()
    const csv = format === 'csv'
    // A byte-order mark makes Excel read the → and ε characters as UTF-8.
    const text = (csv ? '﻿' : '') + transitionTable(d, format)
    downloadText(
      `${fileStem(d.name)}-table.${csv ? 'csv' : 'md'}`,
      text,
      csv ? 'text/csv' : 'text/markdown',
    )
    done('the transition table')
  }
  const asImage = async (format: ImageFormat) => {
    try {
      downloadDataUrl(`${fileStem(doc().name)}.${format}`, await exportCanvas(format))
      done('the image')
    } catch (e) {
      setOpen(false)
      toast('error', e instanceof Error ? e.message : 'Could not export the image.')
    }
  }

  const items: [string, () => void][] = [
    ['Automaton file (.json)', asJson],
    ['Image (.png)', () => void asImage('png')],
    ['Image (.svg)', () => void asImage('svg')],
    ['Transition table (.md)', () => asTable('markdown')],
    ['Transition table (.csv)', () => asTable('csv')],
  ]

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        aria-controls="export-options"
        onClick={() => setOpen((o) => !o)}
      >
        Export ▾
      </button>
      {open && (
        <ul
          id="export-options"
          aria-label="Export options"
          className="absolute left-0 top-full z-40 mt-1 w-56 rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
        >
          {items.map(([label, run]) => (
            <li key={label}>
              <button
                type="button"
                onClick={run}
                className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
