import { describe, expect, it } from 'vitest'
import {
  BIDIRECTIONAL_BOW,
  bowAround,
  distanceToSegment,
  edgePath,
  selfLoopPath,
  type Circle,
} from './edgeGeometry'

const R = 28
const A: Circle = { x: 0, y: 0, r: R }
const B: Circle = { x: 200, y: 0, r: R }

/** Pull every number out of an SVG path string. */
const nums = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
const endpoints = (path: string) => {
  const n = nums(path)
  return { start: { x: n[0], y: n[1] }, end: { x: n[n.length - 2], y: n[n.length - 1] } }
}
const dist = (p: { x: number; y: number }, c: Circle) => Math.hypot(p.x - c.x, p.y - c.y)

describe('edgePath', () => {
  it('draws a straight line that starts and ends on the circle boundaries', () => {
    const { path } = edgePath(A, B)
    expect(path).toBe('M 28 0 L 172 0')
  })

  it('puts the label at the middle of a straight edge', () => {
    expect(edgePath(A, B)).toMatchObject({ labelX: 100, labelY: 0 })
  })

  it('keeps curved endpoints on the boundaries', () => {
    const { start, end } = endpoints(edgePath(A, B, BIDIRECTIONAL_BOW).path)
    expect(dist(start, A)).toBeCloseTo(R, 1)
    expect(dist(end, B)).toBeCloseTo(R, 1)
  })

  it('curves A->B and B->A to opposite sides so they do not overlap', () => {
    const ab = edgePath(A, B, BIDIRECTIONAL_BOW)
    const ba = edgePath(B, A, BIDIRECTIONAL_BOW)
    expect(Math.sign(ab.labelY)).toBe(-Math.sign(ba.labelY))
    expect(Math.abs(ab.labelY - ba.labelY)).toBeGreaterThan(30) // labels clear of each other
    expect(ab.labelX).toBeCloseTo(ba.labelX, 1)
  })

  it('works for vertical and diagonal pairs', () => {
    for (const t of [
      { x: 0, y: 150 },
      { x: -120, y: -90 },
    ]) {
      const target = { ...t, r: R }
      const { start, end } = endpoints(edgePath(A, target).path)
      expect(dist(start, A)).toBeCloseTo(R, 1)
      expect(dist(end, target)).toBeCloseTo(R, 1)
    }
  })

  it('never produces NaN when two states sit on the same spot', () => {
    const { path, labelX, labelY } = edgePath(A, { ...A })
    expect(path).not.toContain('NaN')
    expect(Number.isFinite(labelX + labelY)).toBe(true)
  })
})

describe('selfLoopPath', () => {
  const loop = selfLoopPath(A)

  it('leaves and re-enters the circle on its boundary', () => {
    const { start, end } = endpoints(loop.path)
    expect(dist(start, A)).toBeCloseTo(R, 1)
    expect(dist(end, A)).toBeCloseTo(R, 1)
  })

  it('sits above the state and the label clears the circle', () => {
    expect(loop.labelY).toBeLessThan(-R)
    expect(loop.labelX).toBe(0)
  })

  it('moves with the state', () => {
    const moved = selfLoopPath({ x: 300, y: 100, r: R })
    expect(moved.labelX).toBe(300)
    expect(moved.labelY).toBeCloseTo(loop.labelY + 100, 1)
  })
})

describe('selfLoopPath pointing down', () => {
  const down = selfLoopPath(A, true)

  it('mirrors the loop below the state, still on the boundary', () => {
    const { start, end } = endpoints(down.path)
    expect(dist(start, A)).toBeCloseTo(R, 1)
    expect(dist(end, A)).toBeCloseTo(R, 1)
    expect(down.labelY).toBeGreaterThan(R)
    expect(down.labelY).toBeCloseTo(-selfLoopPath(A).labelY, 1)
  })
})

describe('distanceToSegment', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 100, y: 0 }

  it('measures perpendicular distance inside the segment', () => {
    expect(distanceToSegment({ x: 40, y: 30 }, a, b)).toBe(30)
  })

  it('measures to the nearest end beyond the segment', () => {
    expect(distanceToSegment({ x: 130, y: 40 }, a, b)).toBe(50)
  })

  it('handles a zero-length segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5)
  })
})

describe('bowAround', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 300, y: 0 }

  it('returns 0 when nothing is in the way', () => {
    expect(bowAround(from, to, [{ x: 150, y: 120, r: R }])).toBe(0)
  })

  it('bows away from a blocker sitting on the line', () => {
    const below = bowAround(from, to, [{ x: 150, y: 10, r: R }])
    expect(below).not.toBe(0)
    // Whatever side it picked, the curve's label must end up clear of the blocker.
    const blocker = { x: 150, y: 10, r: R }
    const { labelX, labelY } = edgePath({ ...from, r: R }, { ...to, r: R }, below)
    expect(Math.hypot(labelX - blocker.x, labelY - blocker.y)).toBeGreaterThan(R + 8)
  })

  it('steers to opposite sides for blockers on opposite sides', () => {
    const above = bowAround(from, to, [{ x: 150, y: -10, r: R }])
    const below = bowAround(from, to, [{ x: 150, y: 10, r: R }])
    expect(Math.sign(above)).toBe(-Math.sign(below))
  })
})
