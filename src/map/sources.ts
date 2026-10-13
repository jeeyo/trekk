/**
 * Tile sources. The app only knows source *names*; URLs are always same-origin `/tiles/<name>`,
 * which the container (or Vite in dev) proxies and caches. Upstreams are configured server-side.
 */
export type SourceName = 'terrain' | 'satellite' | 'vector';

export const ATTRIBUTION: Record<SourceName | 'contours', string> = {
  terrain: 'Terrain: Mapzen/AWS Terrain Tiles (SRTM, GMTED, ETOPO1)',
  satellite: 'Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, contains Copernicus data)',
  vector: '© OpenStreetMap contributors (ODbL) · OpenFreeMap',
  contours: 'Contours derived from terrain tiles',
};

export function tileUrl(name: SourceName, origin = location.origin): string {
  switch (name) {
    case 'terrain':
      return `${origin}/tiles/terrain/{z}/{x}/{y}.png`;
    case 'satellite':
      return `${origin}/tiles/satellite/{z}/{x}/{y}.jpg`;
    case 'vector':
      return `${origin}/tiles/vector/planet`;
  }
}

/** OpenFreeMap's TileJSON points at its own host; keep every request on our origin. */
export function rewriteUpstream(url: string, origin = location.origin): string {
  const ofm = 'https://tiles.openfreemap.org/';
  return url.startsWith(ofm) ? `${origin}/tiles/vector/${url.slice(ofm.length)}` : url;
}

export const TERRAIN_MAXZOOM = 15;
export const SATELLITE_MAXZOOM = 15;

export function attributionFor(base: 'satellite' | 'topo' | 'night' | 'minimal'): string {
  const parts = [ATTRIBUTION.terrain];
  if (base === 'satellite') parts.unshift(ATTRIBUTION.satellite);
  if (base === 'topo' || base === 'night') parts.unshift(ATTRIBUTION.vector);
  return parts.join(' · ');
}
