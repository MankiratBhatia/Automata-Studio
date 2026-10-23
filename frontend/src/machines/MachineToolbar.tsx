import { useRef } from 'react'
import { downloadText } from '../download'
import { parsePda, parseTm, serializeMachine } from '../model/machineFiles'
import { fileStem } from '../model/export'
import { emptyPda, emptyTm } from '../model/machines'
import { ParseError } from '../model/serialize'
import { useStudioStore } from '../store/useStudioStore'
import { PDA_EXAMPLES, TM_EXAMPLES } from './examples'
import { useMachineStore } from './useMachineStore'

/** Examples, New, Import, Export and "Undo load" for the pushdown and Turing machine screens. */
export function MachineToolbar({ kind }: { kind: 'pda' | 'tm' }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const canRestore = useMachineStore((s) => s.previous[kind] !== null)
  const toast = useStudioStore.getState().showToast
  const examples = kind === 'pda' ? PDA_EXAMPLES : TM_EXAMPLES

  const load = (machine: ReturnType<typeof emptyPda> | ReturnType<typeof emptyTm>) => {
    const st = useMachineStore.getState()
    if (kind === 'pda') st.loadPda(machine as ReturnType<typeof emptyPda>)
    else st.loadTm(machine as ReturnType<typeof emptyTm>)
  }

  const onImport = async (file: File) => {
    try {
      const text = await file.text()
      load(kind === 'pda' ? parsePda(text) : parseTm(text))
    } catch (e) {
      toast(
        'error',
        e instanceof ParseError
          ? `Could not import ${file.name}: ${e.message}`
          : 'Could not read that file.',
      )
    }
  }

  const onExport = () => {
    const st = useMachineStore.getState()
    const machine = kind === 'pda' ? st.pda : st.tm
    downloadText(`${fileStem(machine.name)}.json`, serializeMachine(machine), 'application/json')
    toast('success', 'Exported the machine file.')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Load example"
        value=""
        onChange={(e) => {
          const ex = examples.find((x) => x.id === e.target.value)
          if (ex) load(ex.machine)
        }}
        className="btn w-44 dark:bg-slate-900"
      >
        <option value="">Examples…</option>
        {examples.map((ex) => (
          <option key={ex.id} value={ex.id}>
            {ex.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        onClick={() => load(kind === 'pda' ? emptyPda() : emptyTm())}
      >
        New
      </button>
      <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
        Import
      </button>
      <button type="button" className="btn" onClick={onExport}>
        Export
      </button>
      <button
        type="button"
        className="btn"
        disabled={!canRestore}
        title={canRestore ? 'Bring back the machine the last load replaced' : 'Nothing to restore'}
        onClick={() => useMachineStore.getState().restorePrevious(kind)}
      >
        Undo load
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        aria-label="Import machine file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void onImport(file)
        }}
      />
    </div>
  )
}
