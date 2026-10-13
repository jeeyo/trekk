import { useEffect, useRef, useState } from 'react';
import { LocalProjection } from '../../track/geo';
import { parseGpx } from '../../track/parseGpx';
import { processTrack, type ProcessedTrack } from '../../track/pipeline';
import { formatDistance, formatDuration, formatElevation } from '../../track/stats';

type LL = { lat: number; lon: number };

interface Layer {
  points: LL[];
  color: string;
  width: number;
  dash?: number[];
  dots?: boolean;
}

function TrackCanvas({ layers, height = 300 }: { layers: Layer[]; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    c.width = w * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#121a16';
    ctx.fillRect(0, 0, w, height);
    const all = layers.flatMap((l) => l.points);
    const proj = LocalProjection.around(all);
    const xy = layers.map((l) => l.points.map((p) => proj.toXY(p.lat, p.lon)));
    const flat = xy.flat();
    const minX = Math.min(...flat.map((p) => p[0]));
    const maxX = Math.max(...flat.map((p) => p[0]));
    const minY = Math.min(...flat.map((p) => p[1]));
    const maxY = Math.max(...flat.map((p) => p[1]));
    const pad = 14;
    const s = Math.min((w - 2 * pad) / (maxX - minX || 1), (height - 2 * pad) / (maxY - minY || 1));
    const ox = (w - (maxX - minX) * s) / 2;
    const oy = (height - (maxY - minY) * s) / 2;
    const tx = (x: number) => ox + (x - minX) * s;
    const ty = (y: number) => height - (oy + (y - minY) * s);
    // 100 m scale bar
    ctx.strokeStyle = '#9aaba1';
    ctx.fillStyle = '#9aaba1';
    ctx.font = '11px system-ui';
    const bar = Math.pow(10, Math.floor(Math.log10(w / 4 / s)));
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(pad + bar * s, height - pad);
    ctx.stroke();
    ctx.fillText(`${bar >= 1000 ? bar / 1000 + ' km' : bar + ' m'}`, pad, height - pad - 5);
    layers.forEach((l, li) => {
      ctx.strokeStyle = l.color;
      ctx.fillStyle = l.color;
      ctx.lineWidth = l.width;
      ctx.setLineDash(l.dash ?? []);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      xy[li].forEach(([x, y], i) => (i ? ctx.lineTo(tx(x), ty(y)) : ctx.moveTo(tx(x), ty(y))));
      ctx.stroke();
      if (l.dots) xy[li].forEach(([x, y]) => ctx.fillRect(tx(x) - 1, ty(y) - 1, 2, 2));
    });
  }, [layers, height]);
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 12 }} />;
}

function Profile({ track }: { track: ProcessedTrack }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = 120;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const pts = track.anim;
    const eles = pts.map((p) => p.ele ?? 0);
    const lo = Math.min(...eles);
    const hi = Math.max(...eles);
    const total = pts[pts.length - 1].dist;
    ctx.fillStyle = '#121a16';
    ctx.fillRect(0, 0, w, h);
    const X = (d: number) => 8 + (d / total) * (w - 16);
    const Y = (e: number) => h - 10 - ((e - lo) / (hi - lo || 1)) * (h - 30);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,122,61,0.55)');
    g.addColorStop(1, 'rgba(255,122,61,0.02)');
    ctx.beginPath();
    ctx.moveTo(X(0), h);
    pts.forEach((p) => ctx.lineTo(X(p.dist), Y(p.ele ?? 0)));
    ctx.lineTo(X(total), h);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((p, i) =>
      i ? ctx.lineTo(X(p.dist), Y(p.ele ?? 0)) : ctx.moveTo(X(p.dist), Y(p.ele ?? 0)),
    );
    ctx.strokeStyle = '#ff7a3d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#9aaba1';
    ctx.font = '11px system-ui';
    ctx.fillText(`${Math.round(hi)} m`, 10, 14);
  }, [track]);
  return (
    <canvas ref={ref} style={{ width: '100%', height: 120, display: 'block', borderRadius: 12 }} />
  );
}

interface Case {
  title: string;
  note: string;
  track: ProcessedTrack;
  layers: Layer[];
  legend: [string, string][];
}

async function load(name: string) {
  const xml = await (await fetch(`/samples/${name}.gpx`)).text();
  return parseGpx(xml);
}

export function TrackDebug() {
  const [cases, setCases] = useState<Case[]>();
  useEffect(() => {
    (async () => {
      const noisyRaw = await load('noisy-alps');
      const noisy = await processTrack(noisyRaw);
      const china = await load('china-huangshan-gcj02');
      const trail: LL[] = await (await fetch('/samples/huangshan-trail.json')).json();
      const chinaFixed = await processTrack(china, { paths: [trail] });
      setCases([
        {
          title: 'Noise & AGPS drift — noisy-alps.gpx',
          note: `${noisy.report.input} pts → ${noisy.report.output}: ${noisy.report.coldStart} cold-start, ${noisy.report.spikes} spikes, ${noisy.report.pauseCollapsed} pause jitter removed, Kalman-smoothed`,
          track: noisy,
          layers: [
            { points: noisyRaw.points, color: 'rgba(248,81,73,0.75)', width: 1, dots: true },
            { points: noisy.points, color: '#3fb950', width: 2.5 },
          ],
          legend: [
            ['rgba(248,81,73,0.9)', 'raw GPS'],
            ['#3fb950', 'cleaned'],
          ],
        },
        {
          title: 'China datum offset — china-huangshan-gcj02.gpx',
          note: `Detected ${chinaFixed.datum.applied.toUpperCase()} (${chinaFixed.datum.reason}); median distance to trail: WGS-84 as-is ${Math.round(chinaFixed.datum.scores!.wgs84)} m → corrected ${Math.round(chinaFixed.datum.scores!.gcj02)} m`,
          track: chinaFixed,
          layers: [
            { points: trail, color: '#e6edf3', width: 1.5, dash: [4, 4] },
            { points: china.points, color: 'rgba(248,81,73,0.85)', width: 2 },
            { points: chinaFixed.points, color: '#3fb950', width: 2.5 },
          ],
          legend: [
            ['#e6edf3', 'trail (OSM stand-in)'],
            ['rgba(248,81,73,0.9)', 'as recorded (GCJ-02)'],
            ['#3fb950', 'corrected to WGS-84'],
          ],
        },
      ]);
    })();
  }, []);

  if (!cases) return <p style={{ padding: 20 }}>Processing samples…</p>;
  return (
    <main className="debug" data-ready="true">
      <h1>Track core</h1>
      {cases.map((c) => (
        <section key={c.title}>
          <h2>{c.title}</h2>
          <TrackCanvas layers={c.layers} />
          <div className="legend">
            {c.legend.map(([col, label]) => (
              <span key={label}>
                <i style={{ background: col }} />
                {label}
              </span>
            ))}
          </div>
          <p className="note">{c.note}</p>
          <Profile track={c.track} />
          <dl className="stats">
            <div>
              <dt>Distance</dt>
              <dd>{formatDistance(c.track.stats.distance)}</dd>
            </div>
            <div>
              <dt>Gain</dt>
              <dd>{formatElevation(c.track.stats.gain ?? 0)}</dd>
            </div>
            <div>
              <dt>Max</dt>
              <dd>{formatElevation(c.track.stats.maxEle ?? 0)}</dd>
            </div>
            <div>
              <dt>Moving</dt>
              <dd>{formatDuration(c.track.stats.movingTime ?? 0)}</dd>
            </div>
          </dl>
        </section>
      ))}
    </main>
  );
}
