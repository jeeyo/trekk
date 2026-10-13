import { useEffect, useRef } from 'react';
import type { ResampledPoint } from '../../track/resample';

/** Elevation profile with an optional progress marker. */
export function Profile({
  points,
  height = 96,
  progress,
}: {
  points: ResampledPoint[];
  height?: number;
  progress?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || points.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = height;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const eles = points.map((p) => p.ele ?? 0);
    const lo = Math.min(...eles);
    const hi = Math.max(...eles);
    const total = points[points.length - 1].dist || 1;
    ctx.clearRect(0, 0, w, h);
    const X = (d: number) => 4 + (d / total) * (w - 8);
    const Y = (e: number) => h - 6 - ((e - lo) / (hi - lo || 1)) * (h - 26);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,122,61,0.5)');
    g.addColorStop(1, 'rgba(255,122,61,0.02)');
    ctx.beginPath();
    ctx.moveTo(X(0), h);
    points.forEach((p) => ctx.lineTo(X(p.dist), Y(p.ele ?? 0)));
    ctx.lineTo(X(total), h);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    points.forEach((p, i) =>
      i ? ctx.lineTo(X(p.dist), Y(p.ele ?? 0)) : ctx.moveTo(X(p.dist), Y(p.ele ?? 0)),
    );
    ctx.strokeStyle = '#ff7a3d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#9aaba1';
    ctx.font = '11px system-ui';
    ctx.fillText(`${Math.round(hi)} m`, 6, 13);
    if (progress !== undefined) {
      const x = X(progress * total);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [points, height, progress]);
  return <canvas ref={ref} className="profile" style={{ height }} />;
}
