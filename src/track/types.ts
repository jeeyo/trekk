export interface TrackPoint {
  lat: number;
  lon: number;
  /** metres above sea level, if known */
  ele?: number;
  /** epoch milliseconds, if known */
  time?: number;
  /** segment index within the GPX file */
  seg: number;
}

export interface ParsedTrack {
  name?: string;
  creator?: string;
  points: TrackPoint[];
}
