// Inline icons: unicode media symbols (⏮ ⏭ ⏸) are missing from many fonts and render as boxes.
type IconName = 'first' | 'prev' | 'play' | 'pause' | 'next' | 'last'
const ICONS: Record<IconName, string> = {
  first: 'M6 5h2v14H6zM20 5v14L9 12z',
  prev: 'M17 5v14L6 12z',
  play: 'M7 4.5v15L19 12z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  next: 'M7 5v14l11-7z',
  last: 'M16 5h2v14h-2zM4 5v14l11-7z',
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  )
}

interface PlaybackProps {
  step: number
  last: number
  playing: boolean
  onGoto: (n: number) => void
  onPlay: (playing: boolean) => void
}

/** First / previous / play-pause / next / last buttons and a step slider. */
export function Playback({ step, last, playing, onGoto, onPlay }: PlaybackProps) {
  const atEnd = step >= last
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1" role="group" aria-label="Playback">
        <button
          type="button"
          className="btn"
          aria-label="Reset"
          onClick={() => onGoto(0)}
          disabled={step === 0}
        >
          <Icon name="first" />
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Previous step"
          onClick={() => onGoto(step - 1)}
          disabled={step === 0}
        >
          <Icon name="prev" />
        </button>
        <button
          type="button"
          className="btn"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (!playing && atEnd) onGoto(0)
            onPlay(!playing)
          }}
          disabled={last === 0}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Next step"
          onClick={() => onGoto(step + 1)}
          disabled={atEnd}
        >
          <Icon name="next" />
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Last step"
          onClick={() => onGoto(last)}
          disabled={atEnd}
        >
          <Icon name="last" />
        </button>
      </div>
      <input
        type="range"
        aria-label="Step"
        min={0}
        max={last}
        value={step}
        onChange={(e) => onGoto(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}
