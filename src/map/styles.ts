import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import type { BaseStyle } from '../presets/types';
import { SATELLITE_MAXZOOM, TERRAIN_MAXZOOM, tileUrl } from './sources';

export interface StyleOptions {
  base: BaseStyle;
  exaggeration: number;
  /** maplibre-contour protocol URL, if contours are wanted */
  contourUrl?: string;
  origin?: string;
}

const PALETTE: Record<
  BaseStyle,
  {
    bg: string;
    shadow: string;
    highlight: string;
    accent: string;
    contour: string;
    sky: string;
    horizon: string;
  }
> = {
  satellite: {
    bg: '#2c3a2f',
    shadow: '#1d2620',
    highlight: '#c9d3c4',
    accent: '#46523f',
    contour: 'rgba(255,255,255,0.18)',
    sky: '#7fb3e6',
    horizon: '#d8e6f0',
  },
  topo: {
    bg: '#f1eee4',
    shadow: '#8c8573',
    highlight: '#ffffff',
    accent: '#b7ad94',
    contour: 'rgba(143,111,64,0.45)',
    sky: '#bcd6ee',
    horizon: '#f4efe2',
  },
  night: {
    bg: '#0b1020',
    shadow: '#03050b',
    highlight: '#2a3556',
    accent: '#151c33',
    contour: 'rgba(120,150,255,0.16)',
    sky: '#05070f',
    horizon: '#1a2240',
  },
  minimal: {
    bg: '#ecebe7',
    shadow: '#9b9a95',
    highlight: '#ffffff',
    accent: '#c9c8c2',
    contour: 'rgba(60,60,60,0.22)',
    sky: '#ecebe7',
    horizon: '#ecebe7',
  },
};

export function buildStyle(o: StyleOptions): StyleSpecification {
  const p = PALETTE[o.base];
  const sources: StyleSpecification['sources'] = {
    terrain: {
      type: 'raster-dem',
      tiles: [tileUrl('terrain', o.origin)],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: TERRAIN_MAXZOOM,
    },
    hillshadeDem: {
      type: 'raster-dem',
      tiles: [tileUrl('terrain', o.origin)],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: TERRAIN_MAXZOOM,
    },
  };
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': p.bg } },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshadeDem',
      paint: {
        'hillshade-shadow-color': p.shadow,
        'hillshade-highlight-color': p.highlight,
        'hillshade-accent-color': p.accent,
        'hillshade-exaggeration': o.base === 'night' ? 0.45 : 0.6,
        'hillshade-illumination-direction': 315,
      },
    },
  ];

  if (o.base === 'satellite') {
    sources.satellite = {
      type: 'raster',
      tiles: [tileUrl('satellite', o.origin)],
      tileSize: 256,
      maxzoom: SATELLITE_MAXZOOM,
    };
    // Imagery sits on top of the hillshade; where it fails to load, shaded relief shows through.
    layers.push({
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-fade-duration': 0, 'raster-saturation': 0.1, 'raster-contrast': 0.08 },
    });
    layers.push({
      id: 'satellite-shade',
      type: 'hillshade',
      source: 'hillshadeDem',
      paint: {
        'hillshade-shadow-color': 'rgba(0,0,0,0.35)',
        'hillshade-highlight-color': 'rgba(255,255,255,0.12)',
        'hillshade-accent-color': 'rgba(0,0,0,0)',
        'hillshade-exaggeration': 0.25,
      },
    });
  }

  if (o.base === 'topo' || o.base === 'night') {
    sources.vector = { type: 'vector', url: tileUrl('vector', o.origin) };
    const v = (l: LayerSpecification) => layers.push(l);
    const topo = o.base === 'topo';
    v({
      id: 'landcover-ice',
      type: 'fill',
      source: 'vector',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'ice'],
      paint: { 'fill-color': topo ? '#ffffff' : '#1c2742', 'fill-opacity': 0.75 },
    });
    v({
      id: 'landcover-wood',
      type: 'fill',
      source: 'vector',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': topo ? '#b9d39b' : '#0f1a1c', 'fill-opacity': 0.55 },
    });
    v({
      id: 'water',
      type: 'fill',
      source: 'vector',
      'source-layer': 'water',
      paint: { 'fill-color': topo ? '#9cc7e6' : '#0a1838' },
    });
    v({
      id: 'waterway',
      type: 'line',
      source: 'vector',
      'source-layer': 'waterway',
      paint: { 'line-color': topo ? '#7fb2d8' : '#16264d', 'line-width': 1 },
    });
    v({
      id: 'paths',
      type: 'line',
      source: 'vector',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['path', 'track'], true, false],
      paint: {
        'line-color': topo ? '#a0522d' : '#2d3b66',
        'line-width': 1,
        'line-dasharray': [3, 2],
      },
    });
    v({
      id: 'roads',
      type: 'line',
      source: 'vector',
      'source-layer': 'transportation',
      filter: ['match', ['get', 'class'], ['path', 'track'], false, true],
      paint: { 'line-color': topo ? '#ffffff' : '#27325a', 'line-width': 1.4 },
    });
  }

  if (o.contourUrl) {
    sources.contours = { type: 'vector', tiles: [o.contourUrl], maxzoom: 15 };
    layers.push({
      id: 'contours',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      paint: {
        'line-color': p.contour,
        'line-width': ['match', ['get', 'level'], 1, 1.1, 0.5],
      },
    });
  }

  return {
    version: 8,
    sources,
    layers,
    terrain: { source: 'terrain', exaggeration: o.exaggeration },
    sky: {
      'sky-color': p.sky,
      'horizon-color': p.horizon,
      'fog-color': p.horizon,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': o.base === 'satellite' ? 0.85 : 0.95,
      'atmosphere-blend': o.base === 'satellite' ? 0.6 : 0,
    },
  };
}
