/**
 * China map datums. GCJ-02 ("Mars coordinates") is the obfuscated datum mandated for maps in
 * mainland China; BD-09 is Baidu's further offset on top of it. Chinese hiking apps and phones
 * using Chinese map SDKs often export GCJ-02/BD-09, which lands 100–700 m off on WGS-84 imagery.
 */
import { LocalProjection, median, pointSegmentDistance } from './geo';

export type Datum = 'wgs84' | 'gcj02' | 'bd09';
type LatLon = { lat: number; lon: number };

const A = 6378245.0;
const EE = 0.006693421622965943;
const X_PI = (Math.PI * 3000.0) / 180.0;

// [north, west, south, east]
const CHINA_INCLUDE: number[][] = [
  [49.2204, 79.4462, 42.8899, 96.33],
  [54.1415, 109.6872, 39.3742, 135.0002],
  [42.8899, 73.1246, 29.5297, 124.143255],
  [29.5297, 82.9684, 26.7186, 97.0352],
  [29.5297, 97.0253, 20.414096, 124.367395],
  [20.414096, 107.975793, 17.871542, 111.744104],
];
const CHINA_EXCLUDE: number[][] = [
  [25.398623, 119.921265, 21.785006, 122.497559], // Taiwan
  [22.5622, 113.8259, 22.1533, 114.431], // Hong Kong
  [22.2171, 113.5283, 22.1095, 113.619], // Macau
  [22.284, 101.8652, 20.0988, 106.665],
  [21.5422, 106.4525, 20.4878, 108.051],
  [55.8175, 109.0323, 50.3257, 119.127],
  [55.8175, 127.4568, 49.5574, 137.0227],
  [44.8922, 131.2662, 42.5692, 137.0227],
];

const inRect = (r: number[], lat: number, lon: number) =>
  lat <= r[0] && lat >= r[2] && lon >= r[1] && lon <= r[3];

export function isInMainlandChina(lat: number, lon: number): boolean {
  return (
    CHINA_INCLUDE.some((r) => inRect(r, lat, lon)) &&
    !CHINA_EXCLUDE.some((r) => inRect(r, lat, lon))
  );
}

function transformLat(x: number, y: number) {
  let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  r +=
    ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return r;
}

function transformLon(x: number, y: number) {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  r += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  r +=
    ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return r;
}

function delta(lat: number, lon: number): [number, number] {
  const dLat0 = transformLat(lon - 105.0, lat - 35.0);
  const dLon0 = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dLat = (dLat0 * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI);
  const dLon = (dLon0 * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [dLat, dLon];
}

export function wgs84ToGcj02(lat: number, lon: number): [number, number] {
  if (!isInMainlandChina(lat, lon)) return [lat, lon];
  const [dLat, dLon] = delta(lat, lon);
  return [lat + dLat, lon + dLon];
}

/** Iterative inverse; converges to < 1e-7° (≈1 cm) in a few steps. */
export function gcj02ToWgs84(lat: number, lon: number): [number, number] {
  if (!isInMainlandChina(lat, lon)) return [lat, lon];
  let wLat = lat;
  let wLon = lon;
  for (let i = 0; i < 10; i++) {
    const [gLat, gLon] = wgs84ToGcj02(wLat, wLon);
    const eLat = gLat - lat;
    const eLon = gLon - lon;
    wLat -= eLat;
    wLon -= eLon;
    if (Math.abs(eLat) < 1e-9 && Math.abs(eLon) < 1e-9) break;
  }
  return [wLat, wLon];
}

export function gcj02ToBd09(lat: number, lon: number): [number, number] {
  const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const t = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * X_PI);
  return [z * Math.sin(t) + 0.006, z * Math.cos(t) + 0.0065];
}

export function bd09ToGcj02(lat: number, lon: number): [number, number] {
  const x = lon - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const t = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.sin(t), z * Math.cos(t)];
}

export function toWgs84(lat: number, lon: number, from: Datum): [number, number] {
  if (from === 'wgs84') return [lat, lon];
  if (from === 'gcj02') return gcj02ToWgs84(lat, lon);
  const [gLat, gLon] = bd09ToGcj02(lat, lon);
  return gcj02ToWgs84(gLat, gLon);
}

export function convertPoints<T extends LatLon>(points: T[], from: Datum): T[] {
  if (from === 'wgs84') return points;
  return points.map((p) => {
    const [lat, lon] = toWgs84(p.lat, p.lon, from);
    return { ...p, lat, lon };
  });
}

/** Apply a manual metre offset (east, north) — the "nudge" escape hatch. */
export function nudgePoints<T extends LatLon>(points: T[], eastM: number, northM: number): T[] {
  if ((!eastM && !northM) || points.length === 0) return points;
  const proj = LocalProjection.around(points);
  return points.map((p) => {
    const [x, y] = proj.toXY(p.lat, p.lon);
    const [lat, lon] = proj.toLatLon(x + eastM, y + northM);
    return { ...p, lat, lon };
  });
}

export function trackInChina(points: LatLon[]): boolean {
  if (points.length === 0) return false;
  const step = Math.max(1, Math.floor(points.length / 50));
  let inside = 0;
  let total = 0;
  for (let i = 0; i < points.length; i += step) {
    total++;
    if (isInMainlandChina(points[i].lat, points[i].lon)) inside++;
  }
  return inside / total > 0.5;
}

const CHINESE_APPS = [
  { re: /baidu|bd09/i, datum: 'bd09' as const },
  {
    re: /2bulu|两步路|foooooot|六只脚|amap|gaode|高德|keep|xingzhe|行者|gcj/i,
    datum: 'gcj02' as const,
  },
];

export interface DatumDetection {
  datum: Datum;
  /** why we decided: path fit score, creator hint, or default */
  reason: 'not-in-china' | 'path-match' | 'creator-hint' | 'default';
  /** median distance (m) from track to OSM paths for each candidate, when paths were available */
  scores?: Record<Datum, number>;
}

/**
 * Decide which datum the track was recorded in.
 * `paths` are nearby OSM footpaths/tracks (WGS-84 polylines). The candidate whose WGS-84
 * conversion hugs the paths best wins, provided it is clearly better than the others.
 */
export function detectDatum(
  points: LatLon[],
  opts: { creator?: string; paths?: LatLon[][] } = {},
): DatumDetection {
  if (!trackInChina(points)) return { datum: 'wgs84', reason: 'not-in-china' };

  const paths = opts.paths?.filter((p) => p.length >= 2) ?? [];
  if (paths.length > 0) {
    const proj = LocalProjection.around(points);
    const segs: number[] = [];
    for (const line of paths) {
      for (let i = 1; i < line.length; i++) {
        const [ax, ay] = proj.toXY(line[i - 1].lat, line[i - 1].lon);
        const [bx, by] = proj.toXY(line[i].lat, line[i].lon);
        segs.push(ax, ay, bx, by);
      }
    }
    const sample = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 300)) === 0);
    const scoreFor = (d: Datum) => {
      const dists = sample.map((p) => {
        const [lat, lon] = toWgs84(p.lat, p.lon, d);
        const [x, y] = proj.toXY(lat, lon);
        let best = Infinity;
        for (let i = 0; i < segs.length; i += 4) {
          const dd = pointSegmentDistance(x, y, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]);
          if (dd < best) best = dd;
        }
        return best;
      });
      return median(dists);
    };
    const scores = { wgs84: scoreFor('wgs84'), gcj02: scoreFor('gcj02'), bd09: scoreFor('bd09') };
    const ranked = (Object.keys(scores) as Datum[]).sort((a, b) => scores[a] - scores[b]);
    // Require a clear winner: at most 40 m off and 2x better than the runner-up.
    if (scores[ranked[0]] < 40 && scores[ranked[0]] * 2 < scores[ranked[1]]) {
      return { datum: ranked[0], reason: 'path-match', scores };
    }
  }

  for (const app of CHINESE_APPS) {
    if (opts.creator && app.re.test(opts.creator))
      return { datum: app.datum, reason: 'creator-hint' };
  }
  return { datum: 'wgs84', reason: 'default' };
}
