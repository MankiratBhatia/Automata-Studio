import type { ReactNode } from 'react'

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'h-6 w-6',
}

/** Small line icons. They are decoration only: the text next to each carries the meaning. */
const ICONS: Record<string, ReactNode> = {
  build: (
    <>
      <circle cx="8" cy="12" r="4" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M11.5 10 15.7 7.2M18 13v6M15 16h6" />
    </>
  ),
  run: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" />
    </>
  ),
  check: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.3 3 7.6 7.5 9 4.5-1.4 7.5-4.7 7.5-9V6z" />
      <path d="m8.8 12 2.4 2.4 4.2-4.6" />
    </>
  ),
  steps: (
    <>
      <path d="M4 18h5v-4h5v-4h6" />
      <path d="M4 18v2M9 14v2M14 10v2" />
    </>
  ),
  compare: (
    <>
      <circle cx="8" cy="12" r="5" />
      <circle cx="16" cy="12" r="5" />
    </>
  ),
  save: (
    <>
      <path d="M12 4v11m0 0 4-4m-4 4-4-4" />
      <path d="M5 19h14" />
    </>
  ),
  examples: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  comfort: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="2" />
      <path d="M7 11h.01M11 11h.01M15 11h.01M8 15h8" />
    </>
  ),
  fa: (
    <>
      <circle cx="7" cy="12" r="4" />
      <circle cx="18" cy="12" r="4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M11 12h3.6M2 12h1.2" />
    </>
  ),
  pda: (
    <>
      <rect x="6" y="4" width="12" height="4" rx="1" />
      <rect x="6" y="10" width="12" height="4" rx="1" />
      <rect x="6" y="16" width="12" height="4" rx="1" />
    </>
  ),
  tm: (
    <>
      <rect x="2.5" y="12" width="4.5" height="6" rx="1" />
      <rect x="7.5" y="12" width="4.5" height="6" rx="1" />
      <rect x="12.5" y="12" width="4.5" height="6" rx="1" />
      <rect x="17.5" y="12" width="4" height="6" rx="1" />
      <path d="m9.8 4 3 4.5h-6z" />
    </>
  ),
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg {...base} className={className ?? base.className}>
      {ICONS[name]}
    </svg>
  )
}
