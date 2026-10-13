import { cleanTrack, type CleanOptions, type CleanReport } from './clean';
import { convertPoints, detectDatum, nudgePoints, type Datum, type DatumDetection } from './datum';
import { blendElevation, sampleDem, type TileFetcher } from './elevation';
import { resampleByDistance, type ResampledPoint } from './resample';
import { computeStats, type TrackStats } from './stats';
import type { ParsedTrack, TrackPoint } from './types';

export interface ProcessOptions {
  clean?: Partial<CleanOptions>;
  /** force a datum instead of auto-detecting */
  datum?: Datum;
  /** OSM paths near the track, used for datum auto-detection */
  paths?: { lat: number; lon: number }[][];
  /** manual offset in metres */
  nudge?: { east: number; north: number };
  /** when given, elevations are corrected against the DEM */
  terrain?: TileFetcher;
  /** spacing for the animation track, m */
  resampleStep?: number;
}

export interface ProcessedTrack {
  name?: string;
  raw: TrackPoint[];
  points: TrackPoint[];
  anim: ResampledPoint[];
  report: CleanReport;
  datum: DatumDetection & { applied: Datum };
  stats: TrackStats;
}

export async function processTrack(
  parsed: ParsedTrack,
  opts: ProcessOptions = {},
): Promise<ProcessedTrack> {
  const detection = detectDatum(parsed.points, { creator: parsed.creator, paths: opts.paths });
  const applied = opts.datum ?? detection.datum;
  const wgs = convertPoints(parsed.points, applied);
  const { points: cleaned, report } = cleanTrack(wgs, opts.clean);
  let points = opts.nudge ? nudgePoints(cleaned, opts.nudge.east, opts.nudge.north) : cleaned;
  if (opts.terrain) {
    try {
      const dem = await sampleDem(points, opts.terrain);
      points = blendElevation(points, dem);
    } catch {
      // DEM unavailable (offline): keep GPS elevation.
    }
  }
  const stats = computeStats(points);
  const step = opts.resampleStep ?? Math.max(5, stats.distance / 4000);
  return {
    name: parsed.name,
    raw: parsed.points,
    points,
    anim: resampleByDistance(points, step),
    report,
    datum: { ...detection, applied },
    stats,
  };
}
