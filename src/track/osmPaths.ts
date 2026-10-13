/**
 * Fetch nearby OSM footpaths/tracks from the vector tiles (OpenMapTiles schema via /tiles/vector)
 * for datum auto-detection. Best effort: returns [] when tiles are unavailable.
 */
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { bounds } from './geo';
import { lonLatToTileXY } from './elevation';

type LL = { lat: number; lon: number };

const PATH_CLASSES = new Set(['path', 'track', 'service', 'minor']);

async function tileTemplate(base: string): Promise<string | undefined> {
  const res = await fetch(`${base}/planet`);
  if (!res.ok) return undefined;
  const tj = (await res.json()) as { tiles?: string[] };
  const t = tj.tiles?.[0];
  if (!t) return undefined;
  // keep requests on our origin
  return t.replace(/^https:\/\/tiles\.openfreemap\.org\//, `${base}/`);
}

export async function fetchOsmPaths(
  points: LL[],
  opts: { base?: string; zoom?: number; maxTiles?: number } = {},
): Promise<LL[][]> {
  const base = opts.base ?? `${location.origin}/tiles/vector`;
  const z = opts.zoom ?? 14;
  try {
    const tpl = await tileTemplate(base);
    if (!tpl) return [];
    // GCJ offsets are up to ~700 m: pad the bbox by ~0.01°
    const [w, s, e, n] = bounds(points);
    const [x0, y0] = lonLatToTileXY(w - 0.01, n + 0.01, z).map(Math.floor);
    const [x1, y1] = lonLatToTileXY(e + 0.01, s - 0.01, z).map(Math.floor);
    const tiles: [number, number][] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push([x, y]);
    if (tiles.length > (opts.maxTiles ?? 16)) return [];
    const lines: LL[][] = [];
    await Promise.all(
      tiles.map(async ([x, y]) => {
        const res = await fetch(
          tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)),
        );
        if (!res.ok) return;
        const vt = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
        const layer = vt.layers.transportation;
        if (!layer) return;
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          if (!PATH_CLASSES.has(String(f.properties.class))) continue;
          const gj = f.toGeoJSON(x, y, z);
          const geom = gj.geometry;
          const parts =
            geom.type === 'LineString'
              ? [geom.coordinates]
              : geom.type === 'MultiLineString'
                ? geom.coordinates
                : [];
          for (const part of parts) lines.push(part.map(([lon, lat]) => ({ lat, lon })));
        }
      }),
    );
    return lines;
  } catch {
    return [];
  }
}
