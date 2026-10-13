import type { Feature, LineString } from 'geojson';
import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
import { REFERENCE_HEIGHT, type CameraState } from '../camera/types';
import type { PresetConfig } from '../presets/types';
import type { ProcessedTrack } from '../track/pipeline';
import { simplifyIndices } from '../track/resample';
import { rewriteUpstream, tileUrl } from './sources';
import { buildStyle } from './styles';

let demSource: InstanceType<typeof mlcontour.DemSource> | undefined;
function contourUrl(): string {
  if (!demSource) {
    demSource = new mlcontour.DemSource({
      url: tileUrl('terrain'),
      encoding: 'terrarium',
      maxzoom: 13,
      worker: true,
    });
    demSource.setupMaplibre(maplibregl);
  }
  return demSource.contourProtocolUrl({
    thresholds: {
      10: [100, 500],
      11: [50, 250],
      12: [50, 250],
      13: [20, 100],
      14: [10, 50],
      15: [10, 50],
    },
    elevationKey: 'ele',
    levelKey: 'level',
    contourLayer: 'contours',
  });
}

export interface SceneOptions {
  container: HTMLElement;
  preset: PresetConfig;
  track: ProcessedTrack;
  pixelRatio?: number;
  interactive?: boolean;
}

type Line = Feature<LineString>;
const lineFeature = (coords: [number, number][]): Line => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: coords.length > 1 ? coords : [coords[0], coords[0]],
  },
});

/** A MapLibre map showing one track in one preset's style, driven frame by frame. */
export class Scene {
  readonly map: MLMap;
  readonly ready: Promise<void>;
  /** sources that failed to load tiles (e.g. imagery blocked or provider down) */
  readonly failedSources = new Set<string>();
  private readonly coords: [number, number][];
  private readonly dists: number[];
  private readonly total: number;

  constructor(private readonly opts: SceneOptions) {
    const { track, preset } = opts;
    // Display geometry: the resampled track, lightly simplified.
    const keep = simplifyIndices(track.anim, 1.5);
    this.coords = keep.map((i) => [track.anim[i].lon, track.anim[i].lat]);
    this.dists = keep.map((i) => track.anim[i].dist);
    this.total = this.dists[this.dists.length - 1] || 1;

    const wantsContours =
      preset.base === 'topo' || preset.base === 'minimal' || preset.base === 'night';
    this.map = new maplibregl.Map({
      container: opts.container,
      style: buildStyle({
        base: preset.base,
        exaggeration: preset.exaggeration,
        contourUrl: wantsContours ? contourUrl() : undefined,
      }),
      interactive: opts.interactive ?? false,
      attributionControl: false,
      pixelRatio: opts.pixelRatio,
      fadeDuration: 0,
      maxPitch: 85,
      // Centre elevation comes from the track (deterministic) instead of async terrain queries.
      centerClampedToGround: false,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      transformRequest: (url) => ({ url: rewriteUpstream(url) }),
    });
    this.map.on('error', (e) => {
      const id = (e as unknown as { sourceId?: string }).sourceId;
      if (id) this.failedSources.add(id);
    });
    // style.load is enough to add layers; tile completeness is awaited separately via idle().
    this.ready = new Promise((resolve) => {
      if (this.map.isStyleLoaded()) resolve();
      else this.map.once('style.load', () => resolve());
    });
    this.ready.then(() => this.addRoute());
  }

  private addRoute() {
    const { line } = this.opts.preset;
    const m = this.map;
    const head = this.coords[0];
    m.addSource('route-full', { type: 'geojson', data: lineFeature(this.coords) });
    m.addSource('route', { type: 'geojson', data: lineFeature([head]) });
    m.addSource('head', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: head } },
    });
    const lineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;
    if (line.ghost) {
      m.addLayer({
        id: 'route-ghost',
        type: 'line',
        source: 'route-full',
        layout: lineLayout,
        paint: { 'line-color': line.ghost, 'line-width': line.width * 0.6 },
      });
    }
    if (line.glow) {
      m.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: lineLayout,
        paint: {
          'line-color': line.glow,
          'line-width': line.width * 4,
          'line-blur': line.width * 3,
          'line-opacity': 0.8,
        },
      });
    }
    m.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: lineLayout,
      paint: {
        'line-color': line.dash ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.35)',
        'line-width': line.width + 3,
      },
    });
    m.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: line.dash ? { 'line-join': 'round' } : lineLayout,
      paint: {
        'line-color': line.color,
        'line-width': line.width,
        ...(line.dash ? { 'line-dasharray': [2, 1.2] } : {}),
      },
    });
    m.addLayer({
      id: 'head-halo',
      type: 'circle',
      source: 'head',
      paint: {
        'circle-radius': line.width * 3,
        'circle-color': line.head,
        'circle-opacity': 0.25,
        'circle-pitch-alignment': 'map',
      },
    });
    m.addLayer({
      id: 'head',
      type: 'circle',
      source: 'head',
      paint: {
        'circle-radius': line.width * 1.4,
        'circle-color': line.head,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-pitch-alignment': 'map',
      },
    });
  }

  /** Coordinates of the route up to `progress` (0..1 of distance), with an interpolated head. */
  sliceAt(progress: number): { coords: [number, number][]; head: [number, number]; index: number } {
    const d = Math.max(0, Math.min(1, progress)) * this.total;
    let lo = 0;
    let hi = this.dists.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.dists[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    const a = this.coords[lo];
    const b = this.coords[Math.min(lo + 1, this.coords.length - 1)];
    const span = this.dists[Math.min(lo + 1, this.dists.length - 1)] - this.dists[lo];
    const t = span > 0 ? (d - this.dists[lo]) / span : 0;
    const head: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { coords: [...this.coords.slice(0, lo + 1), head], head, index: lo };
  }

  setProgress(progress: number) {
    const { coords, head } = this.sliceAt(progress);
    (this.map.getSource('route') as GeoJSONSource | undefined)?.setData(lineFeature(coords));
    (this.map.getSource('head') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: head },
    });
  }

  setCamera(cam: CameraState) {
    // Cameras are computed for a map of REFERENCE_HEIGHT * mapHeight px; rescale to this map.
    const h = this.map.getContainer().clientHeight || REFERENCE_HEIGHT;
    const ref = REFERENCE_HEIGHT * this.opts.preset.mapHeight;
    this.map.jumpTo({
      center: cam.center,
      zoom: cam.zoom + Math.log2(h / ref),
      bearing: cam.bearing,
      pitch: cam.pitch,
      elevation: cam.elevation * this.opts.preset.exaggeration,
    });
  }

  /**
   * Resolve once every visible tile (and terrain) has loaded and a frame has been drawn with them.
   * Checked after each render, so slow devices wait as long as they need (up to `timeoutMs`).
   */
  idle(timeoutMs = 60000): Promise<void> {
    const m = this.map;
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        m.off('render', check);
        m.off('idle', finish);
        resolve();
      };
      const check = () => {
        if (m.loaded() && m.areTilesLoaded()) finish();
      };
      const timer = setTimeout(finish, timeoutMs);
      m.on('render', check);
      m.on('idle', finish);
      m.triggerRepaint();
    });
  }

  /** Screen position (in canvas pixels) of a point on the terrain, or undefined if off-screen. */
  project(lon: number, lat: number, ele: number): [number, number] | undefined {
    const ratio = this.map.getPixelRatio();
    const p = this.map.project([lon, lat]);
    void ele; // MapLibre projects onto the rendered terrain surface
    const c = this.map.getContainer();
    if (p.x < 0 || p.y < 0 || p.x > c.clientWidth || p.y > c.clientHeight) return undefined;
    return [p.x * ratio, p.y * ratio];
  }

  get canvas(): HTMLCanvasElement {
    return this.map.getCanvas();
  }

  destroy() {
    this.map.remove();
  }
}
