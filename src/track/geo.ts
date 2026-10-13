import type { TrackPoint } from './types';

export const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial bearing from a to b in degrees, 0 = north, clockwise. */
export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const φ1 = a.lat * RAD;
  const φ2 = b.lat * RAD;
  const Δλ = (b.lon - a.lon) * RAD;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Local equirectangular (ENU) projection around an origin; accurate to well under 1 m over a trek. */
export class LocalProjection {
  private readonly kx: number;
  private readonly ky: number;
  constructor(
    readonly lat0: number,
    readonly lon0: number,
  ) {
    this.ky = EARTH_R * RAD;
    this.kx = EARTH_R * RAD * Math.cos(lat0 * RAD);
  }
  static around(points: { lat: number; lon: number }[]): LocalProjection {
    let lat = 0;
    let lon = 0;
    for (const p of points) {
      lat += p.lat;
      lon += p.lon;
    }
    return new LocalProjection(lat / points.length, lon / points.length);
  }
  toXY(lat: number, lon: number): [number, number] {
    return [(lon - this.lon0) * this.kx, (lat - this.lat0) * this.ky];
  }
  toLatLon(x: number, y: number): [number, number] {
    return [this.lat0 + y / this.ky, this.lon0 + x / this.kx];
  }
}

/** Cumulative distance in metres along the points; segment gaps are not counted. */
export function cumulativeDistance(points: TrackPoint[]): number[] {
  const out = new Array<number>(points.length);
  let d = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i].seg === points[i - 1].seg) d += haversine(points[i - 1], points[i]);
    out[i] = d;
  }
  return out;
}

export function bounds(points: { lat: number; lon: number }[]): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    if (p.lon < w) w = p.lon;
    if (p.lon > e) e = p.lon;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return [w, s, e, n];
}

/** Distance from point p to segment ab, all in the same planar coordinates. */
export function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
