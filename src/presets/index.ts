import type { PresetConfig } from './types';

/** Default look used by the preview until a preset is chosen. */
export const DEFAULT_PRESET: PresetConfig = {
  id: 'overview',
  name: 'Overview',
  tagline: 'The whole route on 3D terrain',
  base: 'satellite',
  exaggeration: 1.3,
  camera: { mode: 'overview', pitch: 55 },
  line: { color: '#ff7a3d', width: 4, ghost: 'rgba(255,255,255,0.55)', head: '#ff7a3d' },
  mapHeight: 1,
  overlays: { title: true, stats: 'live', profile: false, summitCallout: false, theme: 'dark' },
  durationS: 15,
  timewarp: 'ease',
};
