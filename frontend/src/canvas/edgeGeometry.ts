/** Pure geometry for drawing transitions between circular states. No React, no DOM. */

export interface Point {
  x: number
  y: number
}

export interface Circle extends Point {
  r: number
}

export interface EdgePath {
  path: string
  labelX: number
  labelY: number
}

/** How far a bidirectional pair bows away from the straight line between the centres. */
export const BIDIRECTIONAL_BOW = 38

const unit = (dx: number, dy: number): Point => {
  const len = Math.hypot(dx, dy)
  return len < 1e-6 ? { x: 1, y: 0 } : { x: dx / len, y: dy / len }
}

const onCircle = (c: Circle, towards: Point): Point => {
  const u = unit(towards.x - c.x, towards.y - c.y)
  return { x: c.x + u.x * c.r, y: c.y + u.y * c.r }
}

const fmt = (n: number) => Number(n.toFixed(2))

/**
 * Path from circle `source` to circle `target`, starting and ending exactly on their
 * boundaries (so arrowheads touch the circle). `bow` is the sideways distance of the
 * control point from the straight line: 0 for a straight edge, ±BIDIRECTIONAL_BOW when the
 * reverse edge exists too. The sign is relative to the direction of travel, so A->B and B->A
 * given the same positive `bow` curve to opposite sides and never overlap.
 */
export function edgePath(source: Circle, target: Circle, bow = 0): EdgePath {
  const d = unit(target.x - source.x, target.y - source.y)
  const mid = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  // Rotate the direction a quarter turn to get the side the edge bows towards.
  const ctrl = { x: mid.x - d.y * bow * 2, y: mid.y + d.x * bow * 2 }
  const start = onCircle(source, bow === 0 ? target : ctrl)
  const end = onCircle(target, bow === 0 ? source : ctrl)

  if (bow === 0) {
    return {
      path: `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(end.x)} ${fmt(end.y)}`,
      labelX: fmt((start.x + end.x) / 2),
      labelY: fmt((start.y + end.y) / 2),
    }
  }
  // Quadratic bezier midpoint: 1/4 start + 1/2 control + 1/4 end.
  return {
    path: `M ${fmt(start.x)} ${fmt(start.y)} Q ${fmt(ctrl.x)} ${fmt(ctrl.y)} ${fmt(end.x)} ${fmt(end.y)}`,
    labelX: fmt(start.x / 4 + ctrl.x / 2 + end.x / 4),
    labelY: fmt(start.y / 4 + ctrl.y / 2 + end.y / 4),
  }
}

/** Height of a self-loop above (or below) its state. */
export const LOOP_HEIGHT = 62

/**
 * A loop that leaves and re-enters the circle at the top (or the bottom when `down`), with
 * its label at the apex. Pointing it away from the state's other edges keeps it uncluttered.
 */
export function selfLoopPath(c: Circle, down = false): EdgePath {
  const k = down ? 1 : -1 // +1 is towards the bottom of the screen
  const a = (deg: number): Point => {
    const rad = (deg * Math.PI) / 180
    return { x: c.x + Math.cos(rad) * c.r, y: c.y + Math.sin(rad) * c.r }
  }
  const start = a(k * 125)
  const end = a(k * 55)
  const lift = LOOP_HEIGHT * 1.3
  const c1 = { x: start.x - 26, y: start.y + k * lift }
  const c2 = { x: end.x + 26, y: end.y + k * lift }
  // Cubic bezier at t = 0.5: (P0 + 3*C1 + 3*C2 + P3) / 8.
  const apexY = (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8
  return {
    path: `M ${fmt(start.x)} ${fmt(start.y)} C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`,
    labelX: fmt(c.x),
    labelY: fmt(apexY + k * -2),
  }
}

/** Distance from point `p` to the segment `a`-`b`. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Sideways bow that steers a straight edge a->b around `blockers` (other state circles it
 * would cross or brush). Returns 0 when the straight line is already clear. Uses the same sign
 * convention as `edgePath`: positive bows to the left of the direction of travel.
 */
export function bowAround(a: Point, b: Point, blockers: Circle[], clearance = 12): number {
  const hit = blockers.filter((c) => distanceToSegment(c, a, b) < c.r + clearance)
  if (hit.length === 0) return 0
  const d = unit(b.x - a.x, b.y - a.y)
  const n = { x: -d.y, y: d.x }
  // Which side are the blockers on? Bow the other way. (Sum so a crowd votes.)
  const side = hit.reduce((acc, c) => acc + ((c.x - a.x) * n.x + (c.y - a.y) * n.y), 0)
  return side > 0 ? -BIDIRECTIONAL_BOW : BIDIRECTIONAL_BOW
}
