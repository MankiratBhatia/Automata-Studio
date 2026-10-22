import { useStudioStore } from './store/useStudioStore'

const TONE = {
  error: 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
  success:
    'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
  info: 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
}

/** Short messages that fade on their own. Errors are announced assertively. */
export function ToastHost() {
  const toasts = useStudioStore((s) => s.toasts)
  const dismiss = useStudioStore((s) => s.dismissToast)
  return (
    <div
      aria-label="Notifications"
      role="region"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex items-start gap-2 rounded-md border-l-4 px-3 py-2 text-sm shadow-lg ${TONE[t.kind]}`}
        >
          <p className="flex-1">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
            className="rounded px-1 opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
