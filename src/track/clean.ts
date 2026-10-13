/**
 * GPS / AGPS cleanup: invalid points, cold-start convergence, speed spikes, stationary jitter,
 * and Kalman smoothing. Every step reports what it changed so the UI can explain it.
 */
import { LocalProjection, haversine } from './geo';
import { kalmanOptionsForStrength, rtsSmooth1D } from './kalman';
import type { TrackPoint } from './types';

export interface CleanOptions {
  /** max plausible speed for a trek, km/h */
  maxSpeedKmh: number;
  /** 0 = off … 1 = very smooth */
  smoothing: number;
  /** stationary cluster radius, m */
  pauseRadius: number;
  /** minimum stationary time to collapse, s */
  pauseMinSeconds: number;
  trimColdStart: boolean;
}

export const DEFAULT_CLEAN: CleanOptions = {
  maxSpeedKmh: 25,
  smoothing: 0.5,
  pauseRadius: 15,
  pauseMinSeconds: 60,
  trimColdStart: true,
};

export interface CleanReport {
  input: number;
  invalid: number;
  coldStart: number;
  spikes: number;
  pauseCollapsed: number;
  output: number;
}

/** Seconds between points; when timestamps are missing, assume ~1 point per 5 s of walking. */
function dtSeconds(a: TrackPoint, b: TrackPoint): number {
  if (a.time !== undefined && b.time !== undefined) return (b.time - a.time) / 1000;
  return Math.max(1, haversine(a, b) / 1.2);
}

export function dropInvalid(points: TrackPoint[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) continue;
    if (p.lat === 0 && p.lon === 0) continue;
    const prev = out[out.length - 1];
    if (prev && p.time !== undefined && prev.time !== undefined && p.time <= prev.time) continue;
    if (prev && prev.lat === p.lat && prev.lon === p.lon && p.time === undefined) continue;
    out.push(p);
  }
  return out;
}

/**
 * Drop leading points recorded before the receiver converged: the start is accepted once
 * `need` consecutive steps are all slower than maxSpeed and short. Applied to both ends.
 */
export function trimColdStart(points: TrackPoint[], maxSpeed: number, need = 4): TrackPoint[] {
  const firstGood = (pts: TrackPoint[]) => {
    const limit = Math.min(pts.length - need - 1, 120);
    for (let i = 0; i <= limit; i++) {
      let ok = true;
      for (let k = i; k < i + need && ok; k++) {
        const d = haversine(pts[k], pts[k + 1]);
        const dt = Math.max(dtSeconds(pts[k], pts[k + 1]), 1);
        if (d / dt > maxSpeed || d > 150) ok = false;
      }
      if (ok) return i;
    }
    return 0;
  };
  if (points.length < need * 3) return points;
  const start = firstGood(points);
  const rev = points.slice(start).reverse();
  const end = firstGood(rev);
  return points.slice(start, points.length - end);
}

/**
 * Reject points that imply an impossible speed from the last accepted point. A run of rejections
 * longer than `maxRun` points or `maxRunSeconds` is treated as a genuine relocation and accepted.
 */
export function removeSpikes(
  points: TrackPoint[],
  maxSpeed: number,
  maxRun = 12,
  maxRunSeconds = 120,
): TrackPoint[] {
  if (points.length < 3) return points;
  const out: TrackPoint[] = [points[0]];
  let pending: TrackPoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const last = out[out.length - 1];
    if (p.seg !== last.seg) {
      out.push(p);
      pending = [];
      continue;
    }
    const dt = Math.max(dtSeconds(last, p), 1);
    const speed = haversine(last, p) / dt;
    if (speed <= maxSpeed) {
      out.push(p);
      pending = [];
      continue;
    }
    pending.push(p);
    const runSeconds = dtSeconds(pending[0], p);
    if (pending.length > maxRun || runSeconds > maxRunSeconds) {
      // Consistent new location: accept the run from here on.
      out.push(...pending);
      pending = [];
    }
  }
  return out;
}

/**
 * Remove out-and-back excursions (multipath reflections, AGPS jumps) that a speed filter misses
 * when fixes are sparse: a point far from the last good point is dropped if the track returns
 * close to that good point within the next `lookahead` points.
 */
export function removeExcursions(points: TrackPoint[], minJump = 60, lookahead = 6): TrackPoint[] {
  if (points.length < 3) return points;
  const out: TrackPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    const p = points[i];
    const jump = haversine(last, p);
    let excursion = false;
    if (jump > minJump && p.seg === last.seg) {
      for (let j = i + 1; j <= Math.min(points.length - 1, i + lookahead); j++) {
        if (points[j].seg !== p.seg) break;
        if (haversine(last, points[j]) < jump * 0.25) {
          excursion = true;
          break;
        }
      }
    }
    if (!excursion) out.push(p);
  }
  return out;
}

/**
 * Collapse jitter while stationary (breaks, camp) into its centroid at the first and last time.
 * A cluster only ends after `exitRun` consecutive points leave the radius, so single jitter
 * outliers don't split a long stop into many short ones.
 */
export function collapsePauses(
  points: TrackPoint[],
  radius: number,
  minSeconds: number,
  exitRun = 3,
): TrackPoint[] {
  if (points.length < 3) return points;
  const proj = LocalProjection.around(points);
  const xy = points.map((p) => proj.toXY(p.lat, p.lon));
  const out: TrackPoint[] = [];
  let i = 0;
  while (i < points.length) {
    let sx = xy[i][0];
    let sy = xy[i][1];
    let count = 1;
    let end = i; // last index inside the cluster
    let j = i + 1;
    let outside = 0;
    while (j < points.length && points[j].seg === points[i].seg) {
      const cx = sx / count;
      const cy = sy / count;
      if (Math.hypot(xy[j][0] - cx, xy[j][1] - cy) > radius) {
        if (++outside >= exitRun) break;
      } else {
        // absorb any brief outliers before this point
        for (let k = end + 1; k <= j; k++) {
          sx += xy[k][0];
          sy += xy[k][1];
          count++;
        }
        end = j;
        outside = 0;
      }
      j++;
    }
    const secs = dtSeconds(points[i], points[end]);
    if (count >= 4 && secs >= minSeconds) {
      const [lat, lon] = proj.toLatLon(sx / count, sy / count);
      const eles = points
        .slice(i, end + 1)
        .map((p) => p.ele)
        .filter((e): e is number => e !== undefined);
      const ele = eles.length ? eles.reduce((a, b) => a + b, 0) / eles.length : undefined;
      out.push({ ...points[i], lat, lon, ele });
      out.push({ ...points[end], lat, lon, ele });
      i = end + 1;
    } else {
      out.push(points[i]);
      i++;
    }
  }
  return out;
}

export function smoothTrack(points: TrackPoint[], strength: number): TrackPoint[] {
  if (strength <= 0 || points.length < 3) return points;
  const opts = kalmanOptionsForStrength(strength);
  const proj = LocalProjection.around(points);
  const out: TrackPoint[] = [];
  let s = 0;
  while (s < points.length) {
    let e = s;
    while (e + 1 < points.length && points[e + 1].seg === points[s].seg) e++;
    const seg = points.slice(s, e + 1);
    const xy = seg.map((p) => proj.toXY(p.lat, p.lon));
    const dts = seg.map((p, k) => (k === 0 ? 0 : Math.max(0.5, dtSeconds(seg[k - 1], p))));
    const xs = rtsSmooth1D(
      xy.map((v) => v[0]),
      dts,
      opts,
    );
    const ys = rtsSmooth1D(
      xy.map((v) => v[1]),
      dts,
      opts,
    );
    seg.forEach((p, k) => {
      const [lat, lon] = proj.toLatLon(xs[k], ys[k]);
      out.push({ ...p, lat, lon });
    });
    s = e + 1;
  }
  return out;
}

export function cleanTrack(
  raw: TrackPoint[],
  options: Partial<CleanOptions> = {},
): { points: TrackPoint[]; report: CleanReport } {
  const o = { ...DEFAULT_CLEAN, ...options };
  const maxSpeed = o.maxSpeedKmh / 3.6;
  const valid = dropInvalid(raw);
  const trimmed = o.trimColdStart ? trimColdStart(valid, maxSpeed) : valid;
  const despiked = removeSpikes(removeExcursions(trimmed), maxSpeed);
  const paused = collapsePauses(despiked, o.pauseRadius, o.pauseMinSeconds);
  const smoothed = smoothTrack(paused, o.smoothing);
  return {
    points: smoothed,
    report: {
      input: raw.length,
      invalid: raw.length - valid.length,
      coldStart: valid.length - trimmed.length,
      spikes: trimmed.length - despiked.length,
      pauseCollapsed: despiked.length - paused.length,
      output: smoothed.length,
    },
  };
}
