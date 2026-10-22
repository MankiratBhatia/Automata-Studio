import { getNodesBounds, getViewportForBounds, type ReactFlowInstance } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'

export type ImageFormat = 'png' | 'svg'
type Exporter = (format: ImageFormat) => Promise<string>

// The editable canvas registers itself here so the header can export it without sharing a
// React Flow provider. Null while a different view (replay, comparison) is on screen.
let exporter: Exporter | null = null
export const registerCanvasExporter = (fn: Exporter | null): void => {
  exporter = fn
}
export const exportCanvas = (format: ImageFormat): Promise<string> =>
  exporter
    ? exporter(format)
    : Promise.reject(new Error('Go back to the editor tab to export an image of the canvas.'))

const SIDE_PAD = 60
// Self-loops stick out above or below a state, beyond the node's own bounds.
const LOOP_PAD = 90

/**
 * Render the whole automaton (not just what is scrolled into view) to a data URL, at a size
 * that fits the drawing, on the page's own background colour.
 */
export async function renderCanvas(
  flow: ReactFlowInstance,
  format: ImageFormat,
  background: string,
): Promise<string> {
  const nodes = flow.getNodes()
  if (nodes.length === 0) throw new Error('There is nothing to export: the canvas is empty.')
  const b = getNodesBounds(nodes)
  const bounds = {
    x: b.x - SIDE_PAD,
    y: b.y - LOOP_PAD,
    width: b.width + 2 * SIDE_PAD,
    height: b.height + 2 * LOOP_PAD,
  }
  const width = Math.ceil(bounds.width)
  const height = Math.ceil(bounds.height)
  const viewport = getViewportForBounds(bounds, width, height, 0.5, 2, 0)

  const element = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!element) throw new Error('The canvas is not on screen.')

  const options = {
    backgroundColor: background,
    width,
    height,
    pixelRatio: format === 'png' ? 2 : 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  }
  // The arrowhead is defined once for the whole page, outside the viewport we are about to
  // clone, so the copy would draw every edge without arrowheads. Put a copy of the
  // definition inside the viewport for the duration of the export.
  const defs = document.getElementById('as-arrow')?.closest('svg')?.cloneNode(true) as
    SVGSVGElement | undefined
  if (defs) {
    defs.removeAttribute('id')
    element.append(defs)
  }
  try {
    return format === 'png' ? await toPng(element, options) : await toSvg(element, options)
  } finally {
    defs?.remove()
  }
}
