import { LocalProjection } from '../../track/geo';

type LL = { lat: number; lon: number };

export interface ThumbLayer {
  points: LL[];
  color: string;
  width: number;
  dash?: string;
}

/** Lightweight SVG drawing of one or more tracks, sharing a projection. */
export function RouteThumb({ layers, height = 180 }: { layers: ThumbLayer[]; height?: number }) {
  const all = layers.flatMap((l) => l.points);
  if (all.length < 2) return null;
  const proj = LocalProjection.around(all);
  const xy = layers.map((l) => l.points.map((p) => proj.toXY(p.lat, p.lon)));
  const flat = xy.flat();
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const W = 1000;
  const H = (height / 360) * 1000;
  const pad = 40;
  const s = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="route-thumb"
      style={{ height }}
      preserveAspectRatio="xMidYMid meet"
    >
      {layers.map((l, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={l.color}
          strokeWidth={l.width * 2.6}
          strokeDasharray={l.dash}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={xy[i]
            .map(
              ([x, y]) =>
                `${(ox + (x - minX) * s).toFixed(1)},${(H - (oy + (y - minY) * s)).toFixed(1)}`,
            )
            .join(' ')}
        />
      ))}
    </svg>
  );
}
