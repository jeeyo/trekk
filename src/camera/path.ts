/**
 * Deterministic animation timeline: for any t in 0..1 it gives the route progress and the camera.
 * Preview and export share it, so what you scrub is exactly what gets rendered.
 */
import type { PresetConfig } from '../presets/types';
import { bearing as geoBearing } from '../track/geo';
import type { ResampledPoint } from '../track/resample';
import { fitRoute } from './fit';
import { buildWarp, easeInOutSine, smoothstep } from './timewarp';
import { zoomForDistance, type CameraState } from './types';

export interface Timeline {
  /** route progress (0..1 of distance) at time t */
  progressAt(t: number): number;
  cameraAt(t: number): CameraState;
  /** fraction of the video spent on the intro / outro */
  intro: number;
  outro: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => (((a % 360) + 540) % 360) - 180;
const lerpAngle = (a: number, b: number, t: number) => a + wrap(b - a) * t;

export function mixCamera(a: CameraState, b: CameraState, t: number): CameraState {
  return {
    center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
    zoom: lerp(a.zoom, b.zoom, t),
    bearing: lerpAngle(a.bearing, b.bearing, t),
    pitch: lerp(a.pitch, b.pitch, t),
    elevation: lerp(a.elevation, b.elevation, t),
  };
}

/** Position on the resampled track at a distance fraction. */
export function pointAt(anim: ResampledPoint[], progress: number): ResampledPoint {
  const total = anim[anim.length - 1].dist;
  const d = Math.max(0, Math.min(1, progress)) * total;
  let lo = 0;
  let hi = anim.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (anim[mid].dist <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = anim[lo];
  const b = anim[Math.min(lo + 1, anim.length - 1)];
  const span = b.dist - a.dist;
  const f = span > 0 ? (d - a.dist) / span : 0;
  return {
    ...a,
    lat: lerp(a.lat, b.lat, f),
    lon: lerp(a.lon, b.lon, f),
    ele: a.ele !== undefined && b.ele !== undefined ? lerp(a.ele, b.ele, f) : a.ele,
    dist: d,
  };
}

/**
 * Heading along the route, smoothed: look `window` metres behind and ahead, sampled densely and
 * low-pass filtered forwards and backwards so the chase camera never snaps on switchbacks.
 */
function headingTable(anim: ResampledPoint[], samples = 720, windowM?: number): Float64Array {
  const total = anim[anim.length - 1].dist || 1;
  const w = windowM ?? Math.max(150, Math.min(900, total * 0.06));
  const raw = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const p = i / samples;
    const a = pointAt(anim, p - w / total);
    const b = pointAt(anim, p + w / total);
    raw[i] = geoBearing(a, b);
  }
  // unwrap so smoothing works across ±180
  for (let i = 1; i <= samples; i++) raw[i] = raw[i - 1] + wrap(raw[i] - raw[i - 1]);
  const alpha = 0.06;
  const fwd = new Float64Array(raw);
  for (let i = 1; i <= samples; i++) fwd[i] = fwd[i - 1] + alpha * (raw[i] - fwd[i - 1]);
  const out = new Float64Array(fwd);
  for (let i = samples - 1; i >= 0; i--) out[i] = out[i + 1] + alpha * (fwd[i] - out[i + 1]);
  return out;
}

function sampleTable(table: Float64Array, p: number): number {
  const n = table.length - 1;
  const x = Math.max(0, Math.min(1, p)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return lerp(table[i], table[i + 1], x - i);
}

export function buildTimeline(anim: ResampledPoint[], preset: PresetConfig): Timeline {
  const cam = preset.camera;
  const mode = cam.mode;
  const warp = buildWarp(preset.timewarp, anim);
  const topdown = mode === 'topdown' || mode === 'overview';
  const intro = topdown ? 0.04 : mode === 'flyin' ? 0.16 : 0.08;
  const outro = topdown ? 0.14 : mode === 'flyin' ? 0.16 : 0.12;
  const frameHeight = preset.mapHeight;

  const progressAt = (t: number) => {
    const u = (t - intro) / (1 - intro - outro);
    return u <= 0 ? 0 : u >= 1 ? 1 : warp(u);
  };

  const total = anim[anim.length - 1].dist;
  const headings = headingTable(anim);
  const overviewBearing = mode === 'topdown' ? 0 : wrap(sampleTable(headings, 0.5));
  const overview = fitRoute(anim, {
    pitch: topdown ? cam.pitch : Math.min(cam.pitch, 50),
    bearing: overviewBearing,
    frameHeight,
    padding: topdown ? 0.12 : 0.1,
  });

  // Follow-camera distance scales gently with route length.
  const distance = cam.distance ?? Math.max(1800, Math.min(7000, total * 0.4));

  const follow = (p: number, t: number): CameraState => {
    const pt = pointAt(anim, p);
    if (mode === 'orbit') {
      const start = sampleTable(headings, 0) + 180;
      const spin = (cam.orbitSpeed ?? 12) * t * preset.durationS;
      return {
        center: [pt.lon, pt.lat],
        zoom: zoomForDistance(distance, pt.lat, 1920 * frameHeight),
        bearing: wrap(start + spin),
        pitch: cam.pitch,
        elevation: pt.ele ?? 0,
      };
    }
    // chase: look along the smoothed heading, centre slightly ahead of the head
    const h = sampleTable(headings, p);
    const ahead = pointAt(anim, p + (distance * 0.12) / (total || 1));
    return {
      center: [lerp(pt.lon, ahead.lon, 0.5), lerp(pt.lat, ahead.lat, 0.5)],
      zoom: zoomForDistance(distance, pt.lat, 1920 * frameHeight),
      bearing: wrap(h),
      pitch: cam.pitch,
      elevation: lerp(pt.ele ?? 0, ahead.ele ?? 0, 0.5),
    };
  };

  const cameraAt = (t: number): CameraState => {
    const p = progressAt(t);
    if (topdown) {
      // slow push-in while drawing, then settle back on the full route
      const push = 0.35 * easeInOutSine(Math.min(1, t / (1 - outro)));
      const settle = smoothstep((t - (1 - outro)) / outro);
      return { ...overview, zoom: overview.zoom + push * (1 - settle), bearing: overview.bearing };
    }
    const f = follow(p, t);
    const start =
      mode === 'flyin'
        ? { ...overview, zoom: overview.zoom - 2.2, pitch: 10, bearing: overview.bearing - 40 }
        : overview;
    if (t < intro) return mixCamera(start, follow(0, intro), easeInOutSine(t / intro));
    if (t > 1 - outro)
      return mixCamera(follow(1, 1 - outro), overview, easeInOutSine((t - (1 - outro)) / outro));
    return f;
  };

  return { progressAt, cameraAt, intro, outro };
}
