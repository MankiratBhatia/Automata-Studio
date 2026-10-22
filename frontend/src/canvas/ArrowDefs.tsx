/**
 * The arrowhead shared by every edge, defined once for the whole page. `context-stroke` makes
 * it take the colour of the edge it is attached to.
 */
export function ArrowDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <marker
          id="as-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="12"
          markerHeight="12"
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
  )
}
