import { cumulativeDistance, haversine } from './geo';
import type { TrackPoint } from './types';

export interface TrackStats {
  distance: number; // m
  duration?: number; // ms, first→last timestamp
  movingTime?: number; // ms
  gain?: number; // m
  loss?: number; // m
  minEle?: number;
  maxEle?: number;
  maxEleIndex?: number;
  startTime?: number;
}

/** Elevation gain/loss with hysteresis: only count a climb once it exceeds `threshold` metres. */
export function gainLoss(eles: number[], threshold = 4): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  if (eles.length === 0) return { gain, loss };
  let ref = eles[0];
  for (const e of eles) {
    const d = e - ref;
    if (d >= threshold) {
      gain += d;
      ref = e;
    } else if (d <= -threshold) {
      loss -= d;
      ref = e;
    }
  }
  return { gain, loss };
}

export function computeStats(points: TrackPoint[]): TrackStats {
  const cum = cumulativeDistance(points);
  const stats: TrackStats = { distance: cum[cum.length - 1] ?? 0 };

  const times = points.map((p) => p.time);
  if (times.length > 1 && times[0] !== undefined && times[times.length - 1] !== undefined) {
    stats.startTime = times[0];
    stats.duration = times[times.length - 1]! - times[0]!;
    let moving = 0;
    for (let i = 1; i < points.length; i++) {
      const t0 = points[i - 1].time;
      const t1 = points[i].time;
      if (t0 === undefined || t1 === undefined || points[i].seg !== points[i - 1].seg) continue;
      const dt = t1 - t0;
      if (dt <= 0 || dt > 10 * 60_000) continue;
      if (haversine(points[i - 1], points[i]) / (dt / 1000) > 0.3) moving += dt;
    }
    stats.movingTime = moving;
  }

  const eles = points.map((p) => p.ele).filter((e): e is number => e !== undefined);
  if (eles.length === points.length && eles.length > 0) {
    Object.assign(stats, gainLoss(eles));
    let maxI = 0;
    let minE = Infinity;
    for (let i = 0; i < eles.length; i++) {
      if (eles[i] > eles[maxI]) maxI = i;
      if (eles[i] < minE) minE = eles[i];
    }
    stats.maxEle = eles[maxI];
    stats.maxEleIndex = maxI;
    stats.minEle = minE;
  }
  return stats;
}

export function formatDistance(m: number, units: 'metric' | 'imperial' = 'metric'): string {
  if (units === 'imperial') return `${(m / 1609.344).toFixed(m < 16093 ? 1 : 0)} mi`;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}

export function formatElevation(m: number, units: 'metric' | 'imperial' = 'metric'): string {
  return units === 'imperial'
    ? `${Math.round(m * 3.28084).toLocaleString('en-US')} ft`
    : `${Math.round(m).toLocaleString('en-US')} m`;
}

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
