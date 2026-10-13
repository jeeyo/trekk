/**
 * Generates the sample GPX files in public/samples from hand-placed waypoints along real trails,
 * with elevations from the real DEM, Tobler hiking-speed timestamps and simulated GPS errors.
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/makeSamples.ts
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { LocalProjection, haversine } from '../src/track/geo';
import { wgs84ToGcj02 } from '../src/track/datum';
import { decodeTerrarium, sampleDem, type RgbaTile } from '../src/track/elevation';

type LL = [number, number]; // lat, lon

let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

const tileCache = new Map<string, RgbaTile>();
async function fetchTile(z: number, x: number, y: number): Promise<RgbaTile> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`);
  if (!res.ok) throw new Error(`${key}: ${res.status}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const t = { data: png.data, width: png.width, height: png.height };
  tileCache.set(key, t);
  return t;
}
void decodeTerrarium;

/** Catmull-Rom through waypoints, densified to ~`step` m, with a gentle meander. */
function densify(wps: LL[], step: number): LL[] {
  const proj = new LocalProjection(wps[0][0], wps[0][1]);
  const P = wps.map(([la, lo]) => proj.toXY(la, lo));
  const out: [number, number][] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  // meander: low-frequency lateral offset
  return out.map(([x, y], i) => {
    const m = 6 * Math.sin(i / 23) + 3 * Math.sin(i / 7.3);
    return proj.toLatLon(x + m, y + m * 0.6);
  });
}

interface Pt {
  lat: number;
  lon: number;
  ele: number;
  time: number;
}

async function walk(
  wps: LL[],
  start: string,
  opts: { gpsSigma: number; pauseAt?: number; pauseMin?: number },
) {
  const path = densify(wps, 6);
  const dem = await sampleDem(
    path.map(([lat, lon]) => ({ lat, lon })),
    fetchTile,
    13,
  );
  let t = Date.parse(start);
  const pts: Pt[] = [];
  let ex = 0;
  let ey = 0;
  const baroBias = 18 + gauss() * 5;
  const proj = new LocalProjection(path[0][0], path[0][1]);
  for (let i = 0; i < path.length; i++) {
    if (i > 0) {
      const d = haversine(
        { lat: path[i - 1][0], lon: path[i - 1][1] },
        { lat: path[i][0], lon: path[i][1] },
      );
      const slope = (dem[i] - dem[i - 1]) / Math.max(d, 1);
      const kmh = 0.85 * 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
      t += (d / (kmh / 3.6)) * 1000;
    }
    // correlated GPS error (random walk pulled back to zero)
    ex = 0.85 * ex + gauss() * opts.gpsSigma * 0.5;
    ey = 0.85 * ey + gauss() * opts.gpsSigma * 0.5;
    const [x, y] = proj.toXY(path[i][0], path[i][1]);
    const [lat, lon] = proj.toLatLon(x + ex, y + ey);
    pts.push({ lat, lon, ele: dem[i] + baroBias + gauss() * 2, time: Math.round(t) });
    if (opts.pauseAt !== undefined && i === Math.round(path.length * opts.pauseAt)) {
      const pauseEnd = t + (opts.pauseMin ?? 20) * 60_000;
      while (t < pauseEnd) {
        t += 5000;
        const [jl, jo] = proj.toLatLon(x + gauss() * 6, y + gauss() * 6);
        pts.push({ lat: jl, lon: jo, ele: dem[i] + baroBias + gauss() * 2, time: Math.round(t) });
      }
    }
  }
  return { pts, truePath: path };
}

function toGpx(name: string, pts: Pt[], creator = 'trekk sample generator'): string {
  const body = pts
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.time).toISOString()}</time></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name></metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`;
}

const ROUTES: Record<string, LL[]> = {
  matterhorn: [
    [46.0207, 7.7491],
    [46.0168, 7.7436],
    [46.0121, 7.7372],
    [46.0072, 7.7298],
    [46.0011, 7.7222],
    [45.9958, 7.7151],
    [45.9917, 7.708],
    [45.9889, 7.7009],
    [45.9861, 7.6925],
    [45.9838, 7.6842],
    [45.9822, 7.6762],
  ],
  ebc: [
    [27.9483, 86.8106],
    [27.956, 86.814],
    [27.965, 86.819],
    [27.973, 86.824],
    [27.9806, 86.829],
    [27.988, 86.837],
    [27.995, 86.845],
    [28.0026, 86.8528],
  ],
  huangshan: [
    [30.1165, 118.1915],
    [30.1205, 118.1862],
    [30.1248, 118.1803],
    [30.1283, 118.1745],
    [30.1312, 118.1691],
    [30.133, 118.165],
    [30.1305, 118.1612],
    [30.127, 118.159],
    [30.1243, 118.1622],
    [30.122, 118.165],
  ],
};

async function main() {
  const out = 'public/samples';

  const alps = await walk(ROUTES.matterhorn, '2025-08-14T06:10:00Z', {
    gpsSigma: 3,
    pauseAt: 0.55,
    pauseMin: 25,
  });
  writeFileSync(`${out}/alps-hornli.gpx`, toGpx('Zermatt → Hörnlihütte', alps.pts));

  const ebc = await walk(ROUTES.ebc, '2024-10-21T01:30:00Z', {
    gpsSigma: 3,
    pauseAt: 0.5,
    pauseMin: 30,
  });
  writeFileSync(`${out}/himalaya-ebc.gpx`, toGpx('Lobuche → Everest Base Camp', ebc.pts));

  // Recorded by a Chinese app: GCJ-02 coordinates.
  const hs = await walk(ROUTES.huangshan, '2025-04-05T00:40:00Z', { gpsSigma: 3 });
  const gcj = hs.pts.map((p) => {
    const [lat, lon] = wgs84ToGcj02(p.lat, p.lon);
    return { ...p, lat, lon };
  });
  writeFileSync(`${out}/china-huangshan-gcj02.gpx`, toGpx('黄山 Huangshan', gcj, '2bulu 两步路'));
  // The true trail (stands in for OSM paths in tests).
  writeFileSync(
    'public/samples/huangshan-trail.json',
    JSON.stringify(
      hs.truePath
        .filter((_, i) => i % 3 === 0)
        .map(([lat, lon]) => ({ lat: +lat.toFixed(6), lon: +lon.toFixed(6) })),
    ),
  );

  // Noisy: cold-start jumps, spikes, heavy jitter.
  seed = 7;
  const noisy = await walk(ROUTES.matterhorn, '2025-08-15T06:00:00Z', {
    gpsSigma: 7,
    pauseAt: 0.4,
    pauseMin: 20,
  });
  const p = noisy.pts;
  const proj = new LocalProjection(p[0].lat, p[0].lon);
  const shift = (q: Pt, dx: number, dy: number): Pt => {
    const [x, y] = proj.toXY(q.lat, q.lon);
    const [lat, lon] = proj.toLatLon(x + dx, y + dy);
    return { ...q, lat, lon };
  };
  const cold = [
    [420, -310],
    [260, 380],
    [-190, 240],
    [120, -90],
    [60, 45],
  ].map(([dx, dy], k) => shift({ ...p[0], time: p[0].time - (5 - k) * 4000 }, dx, dy));
  const spikeIdx = [180, 420, 655, 900, 1150];
  for (const i of spikeIdx) p[i] = shift(p[i], 300 + rand() * 500, -200 - rand() * 400);
  // a 3-point multipath excursion
  for (let k = 0; k < 3; k++) p[1300 + k] = shift(p[1300 + k], 180 + k * 40, 220 + k * 30);
  writeFileSync(
    `${out}/noisy-alps.gpx`,
    toGpx('Noisy recording (cold start + spikes)', [...cold, ...p]),
  );
  writeFileSync(
    'tests/fixtures/noisy-meta.json',
    JSON.stringify({ coldStart: cold.length, spikes: spikeIdx.length + 3 }),
  );

  for (const f of ['alps-hornli', 'himalaya-ebc', 'china-huangshan-gcj02', 'noisy-alps'])
    console.log('wrote', f);
}

main();
