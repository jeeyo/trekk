import { create } from 'zustand';
import type { CleanOptions } from '../track/clean';
import type { Datum } from '../track/datum';
import { trackInChina } from '../track/datum';
import { browserTerrainFetcher } from '../track/elevation';
import { fetchOsmPaths } from '../track/osmPaths';
import { parseGpx } from '../track/parseGpx';
import { processTrack, type ProcessedTrack } from '../track/pipeline';
import type { ParsedTrack } from '../track/types';

export type Step = 'upload' | 'track' | 'style' | 'preview' | 'export';
export const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'track', label: 'Track' },
  { id: 'style', label: 'Style' },
  { id: 'preview', label: 'Preview' },
  { id: 'export', label: 'Export' },
];

export interface TrackFix {
  clean: Partial<CleanOptions>;
  datum?: Datum;
  nudge: { east: number; north: number };
}

interface State {
  step: Step;
  fileName?: string;
  parsed?: ParsedTrack;
  track?: ProcessedTrack;
  busy: boolean;
  error?: string;
  fix: TrackFix;
  presetId: string;
  /** video length override, seconds */
  duration?: number;
  title: string;
  units: 'metric' | 'imperial';
  setStep(step: Step): void;
  loadFile(name: string, xml: string): Promise<void>;
  reprocess(fix: Partial<TrackFix>): Promise<void>;
  setPreset(id: string): void;
  setDuration(s: number): void;
  setTitle(title: string): void;
  setUnits(u: 'metric' | 'imperial'): void;
  reset(): void;
}

const terrain = browserTerrainFetcher();
const initialFix: TrackFix = { clean: {}, nudge: { east: 0, north: 0 } };

// OSM paths are only needed to tell China datums apart; fetched once per file.
const pathCache = new WeakMap<ParsedTrack, Promise<{ lat: number; lon: number }[][]>>();
function pathsFor(parsed: ParsedTrack) {
  if (!trackInChina(parsed.points)) return Promise.resolve([]);
  if (!pathCache.has(parsed)) pathCache.set(parsed, fetchOsmPaths(parsed.points));
  return pathCache.get(parsed)!;
}

async function run(parsed: ParsedTrack, fix: TrackFix) {
  const paths = await pathsFor(parsed);
  return processTrack(parsed, {
    clean: fix.clean,
    datum: fix.datum,
    nudge: fix.nudge,
    terrain,
    paths,
  });
}

export const useStore = create<State>((set, get) => ({
  step: 'upload',
  busy: false,
  fix: initialFix,
  presetId: 'chase',
  title: '',
  units: 'metric',
  setStep: (step) => set({ step }),
  async loadFile(name, xml) {
    set({ busy: true, error: undefined, fileName: name });
    try {
      const parsed = parseGpx(xml);
      const track = await run(parsed, initialFix);
      set({
        parsed,
        track,
        fix: initialFix,
        title: parsed.name ?? name.replace(/\.gpx$/i, ''),
        step: 'track',
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ busy: false });
    }
  },
  async reprocess(partial) {
    const { parsed, fix } = get();
    if (!parsed) return;
    const next = { ...fix, ...partial, clean: { ...fix.clean, ...partial.clean } };
    set({ busy: true, fix: next });
    try {
      set({ track: await run(parsed, next) });
    } finally {
      set({ busy: false });
    }
  },
  setPreset: (presetId) => set({ presetId, duration: undefined }),
  setDuration: (duration) => set({ duration }),
  setTitle: (title) => set({ title }),
  setUnits: (units) => set({ units }),
  reset: () =>
    set({
      step: 'upload',
      parsed: undefined,
      track: undefined,
      fileName: undefined,
      error: undefined,
    }),
}));
