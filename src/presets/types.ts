export type BaseStyle = 'satellite' | 'topo' | 'night' | 'minimal';
export type CameraMode = 'chase' | 'orbit' | 'flyin' | 'topdown' | 'overview';
export type TimeWarp = 'linear' | 'climb' | 'ease';

export interface LineStyle {
  color: string;
  width: number;
  /** soft glow underneath the line */
  glow?: string;
  /** dashed line (drawn as a dashed overlay) */
  dash?: boolean;
  /** faint full route under the progress line */
  ghost?: string;
  /** colour of the head marker */
  head: string;
}

export interface PresetConfig {
  id: string;
  name: string;
  tagline: string;
  base: BaseStyle;
  exaggeration: number;
  camera: {
    mode: CameraMode;
    pitch: number;
    /** camera distance behind the head, metres (chase/orbit) */
    distance?: number;
    /** degrees per second (orbit) */
    orbitSpeed?: number;
  };
  line: LineStyle;
  /** fraction of the frame height given to the map; the rest is the overlay panel */
  mapHeight: number;
  overlays: {
    title: boolean;
    stats: 'live' | 'end' | 'none';
    profile: boolean;
    summitCallout: boolean;
    theme: 'light' | 'dark';
  };
  durationS: number;
  timewarp: TimeWarp;
}
