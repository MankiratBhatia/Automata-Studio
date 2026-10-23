import { Modal } from './components/Modal'
import { useStudioStore } from './store/useStudioStore'

const SHORTCUTS: [string, string][] = [
  ['S', 'Add a state (finite automata)'],
  ['Delete / Backspace', 'Delete the selected state or transition'],
  ['Ctrl+Z', 'Undo'],
  ['Ctrl+Y or Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+S', 'Save the current tab as a project'],
  ['Space', 'Next step (simulations, replays and machine runs)'],
  ['← →', 'Previous / next step while the step player has focus'],
  ['Double-click canvas', 'Add a state where you click'],
  ['Double-click a label', 'Edit a transition’s symbols'],
  ['?', 'Show this list'],
  ['Esc', 'Close a dialog'],
]

export function HelpDialog() {
  const open = useStudioStore((s) => s.helpOpen)
  if (!open) return null
  const close = () => useStudioStore.getState().setHelpOpen(false)
  return (
    <Modal title="Keyboard shortcuts" onClose={close} wide>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        On a Mac, use ⌘ in place of Ctrl. Single-key shortcuts are ignored while you type in a
        field.
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([keys, what]) => (
            <tr key={keys} className="border-t border-slate-200 dark:border-slate-700">
              <th scope="row" className="py-1.5 pr-3 text-left font-mono text-xs font-semibold">
                {keys}
              </th>
              <td className="py-1.5">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  )
}
