/** DEM elevation from Terrarium-encoded tiles (AWS Terrain Tiles / Mapterhorn). */
import { median } from './geo';
import type { TrackPoint } from './types';

export const decodeTerrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

export function lonLatToTileXY(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  return [x, y];
}

export interface RgbaTile {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export type TileFetcher = (z: number, x: number, y: number) => Promise<RgbaTile>;

/** Sample DEM elevation for each point (bilinear) at zoom `z`. */
export async function sampleDem(
  points: { lat: number; lon: number }[],
  fetchTile: TileFetcher,
  z = 12,
): Promise<number[]> {
  const cache = new Map<string, Promise<RgbaTile>>();
  const get = (x: number, y: number) => {
    const n = 2 ** z;
    const tx = ((x % n) + n) % n;
    const key = `${tx}/${y}`;
    if (!cache.has(key)) cache.set(key, fetchTile(z, tx, y));
    return cache.get(key)!;
  };
  const pixel = async (gx: number, gy: number, size: number) => {
    const tx = Math.floor(gx / size);
    const ty = Math.floor(gy / size);
    const t = await get(tx, ty);
    const px = gx - tx * size;
    const py = gy - ty * size;
    const i = (py * t.width + px) * 4;
    return decodeTerrarium(t.data[i], t.data[i + 1], t.data[i + 2]);
  };
  const size = 256;
  return Promise.all(
    points.map(async (p) => {
      const [fx, fy] = lonLatToTileXY(p.lon, p.lat, z);
      const gx = fx * size - 0.5;
      const gy = fy * size - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const [a, b, c, d] = await Promise.all([
        pixel(x0, y0, size),
        pixel(x0 + 1, y0, size),
        pixel(x0, y0 + 1, size),
        pixel(x0 + 1, y0 + 1, size),
      ]);
      return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
    }),
  );
}

export function medianFilter(values: number[], window = 5): number[] {
  const h = window >> 1;
  // Symmetric window that shrinks at the ends, so endpoints are not pulled inward.
  return values.map((_, i) => {
    const k = Math.min(h, i, values.length - 1 - i);
    return median(values.slice(i - k, i + k + 1));
  });
}

/**
 * Combine GPS altitude with DEM. Barometric/GPS altitude can carry a constant offset but has good
 * relative shape; DEM is unbiased but coarse. Without GPS altitude, use DEM directly.
 * `demWeight` 1 = DEM only.
 */
export function blendElevation(points: TrackPoint[], dem: number[], demWeight = 0.7): TrackPoint[] {
  const hasGps = points.every((p) => p.ele !== undefined);
  let eles: number[];
  if (!hasGps) {
    eles = dem;
  } else {
    // Remove the GPS altitude bias against the DEM first, then blend.
    const bias = median(points.map((p, i) => p.ele! - dem[i]));
    eles = points.map((p, i) => demWeight * dem[i] + (1 - demWeight) * (p.ele! - bias));
  }
  const filtered = medianFilter(eles, 5);
  return points.map((p, i) => ({ ...p, ele: filtered[i] }));
}

/** Browser tile fetcher: decodes PNG tiles from our /tiles/terrain proxy. */
export function browserTerrainFetcher(base = '/tiles/terrain'): TileFetcher {
  return async (z, x, y) => {
    const res = await fetch(`${base}/${z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`terrain tile ${z}/${x}/${y}: ${res.status}`);
    const bmp = await createImageBitmap(await res.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    return {
      data: ctx.getImageData(0, 0, bmp.width, bmp.height).data,
      width: bmp.width,
      height: bmp.height,
    };
  };
}
