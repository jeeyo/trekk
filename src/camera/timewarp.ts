import type { ResampledPoint } from '../track/resample';
import type { TimeWarp } from '../presets/types';

export const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
export const easeInOutSine = (x: number) =>
  -(Math.cos(Math.PI * Math.max(0, Math.min(1, x))) - 1) / 2;

/**
 * Map normalised drawing time (0..1) to route progress (0..1 of distance).
 * 'climb' spends more time on ascents and rushes through flats and descents.
 */
export function buildWarp(kind: TimeWarp, anim: ResampledPoint[]): (u: number) => number {
  if (kind === 'linear') return (u) => u;
  if (kind === 'ease') return (u) => 0.08 * easeInOutSine(u) + 0.92 * u; // gentle ease in/out
  // climb: cumulative "effort" per metre, inverted
  const n = anim.length;
  const total = anim[n - 1]?.dist || 1;
  const effort = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dd = anim[i].dist - anim[i - 1].dist || 1;
    const slope = ((anim[i].ele ?? 0) - (anim[i - 1].ele ?? 0)) / dd;
    const w = 0.45 + 6 * Math.max(0, slope); // flats fast, climbs slow
    effort[i] = effort[i - 1] + w * dd;
  }
  const E = effort[n - 1] || 1;
  return (u) => {
    const target = Math.max(0, Math.min(1, u)) * E;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (effort[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return 0;
    const e0 = effort[lo - 1];
    const e1 = effort[lo];
    const f = e1 > e0 ? (target - e0) / (e1 - e0) : 0;
    return (anim[lo - 1].dist + f * (anim[lo].dist - anim[lo - 1].dist)) / total;
  };
}
