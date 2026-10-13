import { LocalProjection, cumulativeDistance } from './geo';
import type { TrackPoint } from './types';

export interface ResampledPoint extends TrackPoint {
  /** metres from start */
  dist: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpOpt = (a: number | undefined, b: number | undefined, t: number) =>
  a !== undefined && b !== undefined ? lerp(a, b, t) : (a ?? b);

/** Resample at a uniform spacing along the track (gaps between segments are bridged). */
export function resampleByDistance(points: TrackPoint[], step: number): ResampledPoint[] {
  if (points.length === 0) return [];
  const cum = cumulativeDistance(points);
  const total = cum[cum.length - 1];
  const out: ResampledPoint[] = [];
  let j = 0;
  for (let d = 0; d <= total + 1e-6; d += step) {
    while (j < points.length - 2 && cum[j + 1] < d) j++;
    const a = points[j];
    const b = points[Math.min(j + 1, points.length - 1)];
    const span = cum[Math.min(j + 1, points.length - 1)] - cum[j];
    const t = span > 0 ? Math.min(1, Math.max(0, (d - cum[j]) / span)) : 0;
    out.push({
      lat: lerp(a.lat, b.lat, t),
      lon: lerp(a.lon, b.lon, t),
      ele: lerpOpt(a.ele, b.ele, t),
      time: lerpOpt(a.time, b.time, t),
      seg: a.seg,
      dist: d,
    });
  }
  const last = points[points.length - 1];
  if (out.length === 0 || out[out.length - 1].dist < total - 1e-6)
    out.push({ ...last, dist: total });
  return out;
}

/** Douglas–Peucker simplification with a tolerance in metres. Returns kept indices. */
export function simplifyIndices(
  points: { lat: number; lon: number }[],
  tolerance: number,
): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);
  const proj = LocalProjection.around(points);
  const xy = points.map((p) => proj.toXY(p.lat, p.lon));
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = xy[s];
    const [bx, by] = xy[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
