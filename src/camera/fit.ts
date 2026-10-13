import { bounds } from '../track/geo';
import { REFERENCE_HEIGHT, type CameraState } from './types';

const WIDTH = (REFERENCE_HEIGHT * 9) / 16;

const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/** Camera that frames the whole route in a 9:16 frame (top-down zoom, then pitched). */
export function fitRoute(
  points: { lat: number; lon: number; ele?: number }[],
  opts: { pitch?: number; bearing?: number; padding?: number; frameHeight?: number } = {},
): CameraState {
  const [w, s, e, n] = bounds(points);
  const pad = opts.padding ?? 0.18;
  const frameH = (opts.frameHeight ?? 1) * REFERENCE_HEIGHT;
  const spanX = Math.max((e - w) / 360, 1e-7);
  const spanY = Math.max(mercY(s) - mercY(n), 1e-7);
  // rotate the bbox approximately by bearing: use the larger extent for safety when rotated
  const rot = ((opts.bearing ?? 0) * Math.PI) / 180;
  const rx = Math.abs(Math.cos(rot)) * spanX + Math.abs(Math.sin(rot)) * spanY;
  const ry = Math.abs(Math.sin(rot)) * spanX + Math.abs(Math.cos(rot)) * spanY;
  const zx = Math.log2((WIDTH * (1 - 2 * pad)) / (rx * 512));
  const zy = Math.log2((frameH * (1 - 2 * pad)) / (ry * 512));
  const pitch = opts.pitch ?? 0;
  // pitched views foreshorten the far side; back off a little
  const zoom = Math.min(zx, zy) - (pitch / 60) * 0.35;
  const eles = points.map((p) => p.ele).filter((v): v is number => v !== undefined);
  const elevation = eles.length ? (Math.min(...eles) + Math.max(...eles)) / 2 : 0;
  return { center: [(w + e) / 2, (s + n) / 2], zoom, bearing: opts.bearing ?? 0, pitch, elevation };
}
